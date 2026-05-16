import { readdir, readFile, stat } from 'fs/promises';
import { basename, extname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDb, getCourse, upsertCourse } from '../lib/db.js';
import { screenCourse } from '../screening/screen.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_ROOT = join(__dirname, '../..');
const WORKSPACE_ROOT = join(SCRAPER_ROOT, '..');
const DEFAULT_LIBRARY_ROOT = join(WORKSPACE_ROOT, 'library');
const LOCAL_SOURCE_KIND = 'local_library';
const DEFAULT_LIMIT = 100;
const PRESERVED_NOTEBOOKLM_STATUSES = new Set([
  'ready_for_notebooklm',
  'approved_for_notebooklm',
  'uploaded_to_notebooklm',
  'notebooklm_validated'
]);

const KNOWN_COURSES = {
  'MIT-6.0001-Introduction-to-Computer-Science-and-Programming-in-Python': {
    courseId: '6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016',
    title: 'Introduction to Computer Science and Programming in Python'
  },
  'MIT-6.0002-Introduction-to-Computational-Thinking-and-Data-Science': {
    courseId: '6-0002-introduction-to-computational-thinking-and-data-science-fall-2016',
    title: 'Introduction to Computational Thinking and Data Science'
  },
  'MIT-6.034-Artificial-Intelligence': {
    courseId: '6-034-artificial-intelligence-fall-2010',
    title: 'Artificial Intelligence'
  },
  'MIT-6.036-Introduction-to-Machine-Learning': {
    courseId: '6-036-introduction-to-machine-learning-fall-2020',
    title: 'Introduction to Machine Learning'
  },
  'MIT-6.867-Machine-Learning': {
    courseId: '6-867-machine-learning-fall-2006',
    title: 'Machine Learning'
  },
  'MIT-15.773-Hands-on-Deep-Learning': {
    courseId: '15-773-hands-on-deep-learning-spring-2024',
    title: 'Hands-on Deep Learning'
  },
  'MIT-6.7960-Deep-Learning': {
    courseId: '6-7960-deep-learning-fall-2024',
    title: 'Deep Learning'
  },
  'MIT-6.8300-Advances-in-Computer-Vision': {
    courseId: '6-8300-advances-in-computer-vision-spring-2025',
    title: 'Advances in Computer Vision'
  },
  'MIT-6.S191-Introduction-to-Deep-Learning': {
    courseId: '6-s191-introduction-to-deep-learning-january-iap-2020',
    title: 'Introduction to Deep Learning'
  },
  'MIT-RES.10-002-Ethics-of-AI-Bias': {
    courseId: 'res-10-002-ethics-of-ai-bias-spring-2023',
    title: 'Ethics of AI Bias'
  },
  'MAS.S60-How2AI-Spring2025': {
    courseId: 'mas-s60-how-to-ai-almost-anything-spring-2025',
    title: 'How to AI (Almost) Anything'
  }
};

export function getLocalImportOptions(args = []) {
  return {
    root: getOptionValue(args, '--root') || DEFAULT_LIBRARY_ROOT,
    courseId: getOptionValue(args, '--course-id'),
    dryRun: args.includes('--dry-run'),
    rescreen: args.includes('--rescreen'),
    fast: args.includes('--fast'),
    limit: getPositiveIntegerOption(args, '--limit', DEFAULT_LIMIT)
  };
}

export async function importLocalLibrary(options = {}) {
  const courseDirs = await discoverCourseDirs(options.root || DEFAULT_LIBRARY_ROOT);
  const selectedDirs = options.courseId
    ? courseDirs.filter(dir => inferCourseIdentity(dir).courseId === options.courseId)
    : courseDirs.slice(0, options.limit || DEFAULT_LIMIT);
  const results = [];

  for (const dir of selectedDirs) {
    const identity = await loadCourseIdentity(dir);
    const materials = await collectLocalMaterials(dir, identity.courseId);
    const existing = getCourse(identity.courseId);
    const rescreenResult = options.rescreen
      ? await safeRescreen(identity.courseId, options)
      : null;

    if (!options.dryRun) {
      upsertCourse(identity.courseId, {
        title: existing?.title || identity.title,
        course_title: existing?.title || identity.title,
        source_url: existing?.source_url || identity.sourceUrl,
        departments: existing ? parseJsonArray(existing.departments) : identity.departments,
        department_numbers: existing ? parseJsonArray(existing.department_numbers) : identity.departmentNumbers,
        as_taught_in: existing?.as_taught_in || identity.asTaughtIn,
        term: existing?.term || identity.term,
        year: existing?.year || identity.year,
        level: existing ? parseJsonArray(existing.level) : identity.level,
        topics: existing ? parseJsonArray(existing.topics) : identity.topics,
        instructors: existing ? parseJsonArray(existing.instructors) : identity.instructors,
        learning_resource_types: mergeValues(
          existing ? parseJsonArray(existing.learning_resource_types) : identity.learningResourceTypes,
          inferLearningResourceTypes(materials)
        ),
        course_page_metadata: {
          ...(existing ? safeJsonParse(existing.course_page_metadata, {}) : {}),
          local_library_dir: relative(WORKSPACE_ROOT, dir)
        }
      });

      replaceLocalMaterials(identity.courseId, materials);
      restorePreservedStatus(identity.courseId, existing);
    }

    results.push({
      course_id: identity.courseId,
      title: existing?.title || identity.title,
      directory: relative(WORKSPACE_ROOT, dir),
      local_materials: materials.length,
      pdfs: materials.filter(material => material.media_type === 'pdf').length,
      videos: materials.filter(material => material.media_type === 'youtube' || material.media_type === 'video').length,
      markdown: materials.filter(material => material.media_type === 'markdown').length,
      rescreen: rescreenResult,
      dry_run: Boolean(options.dryRun)
    });
  }

  return results;
}

export function printLocalImportResults(results) {
  console.log('\n=== Local Library Import ===\n');

  if (results.length === 0) {
    console.log('Keine lokalen Kursordner gefunden.');
    return;
  }

  for (const result of results) {
    const mode = result.dry_run ? 'dry-run' : 'imported';
    console.log(`${result.course_id}`);
    console.log(`  ${result.title}`);
    console.log(`  ${mode}: materials=${result.local_materials} pdfs=${result.pdfs} videos=${result.videos} markdown=${result.markdown}`);
    console.log(`  dir=${result.directory}`);
    if (result.rescreen) {
      const status = result.rescreen.error ? `error=${result.rescreen.error}` : `tier=${result.rescreen.tier} score=${result.rescreen.score} deep=${result.rescreen.deepScan}`;
      console.log(`  rescreen: ${status}`);
    }
    console.log('');
  }
}

async function discoverCourseDirs(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith('.') && entry.name !== 'notebooklm')
    .map(entry => join(root, entry.name))
    .sort();
}

async function loadCourseIdentity(dir) {
  const inferred = inferCourseIdentity(dir);
  const dataJson = await readJsonIfExists(join(dir, 'data.json'));

  if (!dataJson) return inferred;

  return {
    ...inferred,
    title: dataJson.course_title || inferred.title,
    sourceUrl: inferred.sourceUrl,
    term: dataJson.term || inferred.term,
    year: dataJson.year || inferred.year,
    level: dataJson.level || inferred.level,
    topics: dataJson.topics || inferred.topics,
    instructors: dataJson.instructors || inferred.instructors,
    departmentNumbers: dataJson.department_numbers || inferred.departmentNumbers,
    learningResourceTypes: dataJson.learning_resource_types || inferred.learningResourceTypes
  };
}

function inferCourseIdentity(dir) {
  const folderName = basename(dir);
  const known = KNOWN_COURSES[folderName];
  const courseId = known?.courseId || slugifyCourseFolder(folderName);
  const title = known?.title || titleFromFolder(folderName);

  return {
    courseId,
    title,
    sourceUrl: `https://ocw.mit.edu/courses/${courseId}/`,
    term: inferTerm(courseId),
    year: inferYear(courseId),
    asTaughtIn: [inferTerm(courseId), inferYear(courseId)].filter(Boolean).join(' ') || null,
    level: [],
    topics: [],
    instructors: [],
    departments: [],
    departmentNumbers: inferDepartmentNumbers(courseId),
    learningResourceTypes: []
  };
}

async function collectLocalMaterials(dir, courseId) {
  const files = await walkFiles(dir);
  const lectureTopics = await loadLectureTopics(dir);
  const videoLinks = await loadLectureVideoLinks(dir);
  const materials = [];

  for (const file of files) {
    const relativePath = relative(WORKSPACE_ROOT, file);
    const fileName = basename(file);
    if (fileName === '.DS_Store' || fileName === 'course.zip') continue;

    const info = await stat(file);
    const classification = classifyLocalFile(file, lectureTopics);
    if (!classification) continue;

    materials.push({
      course_id: courseId,
      type: classification.materialType,
      title: classification.title,
      material_type: classification.materialType,
      media_type: classification.mediaType,
      source_kind: LOCAL_SOURCE_KIND,
      resource_id: null,
      resource_path: relativePath,
      source_url: null,
      local_path: relativePath,
      extraction_status: 'downloaded',
      metadata: {
        bytes: info.size,
        modified_at: info.mtime.toISOString(),
        lecture_number: classification.lectureNumber,
        inferred_from: classification.inferredFrom
      }
    });
  }

  for (const video of videoLinks) {
    materials.push({
      course_id: courseId,
      type: 'Lecture Videos',
      title: video.title,
      material_type: 'Lecture Videos',
      media_type: 'youtube',
      source_kind: LOCAL_SOURCE_KIND,
      resource_id: null,
      resource_path: relative(WORKSPACE_ROOT, video.sourceFile),
      source_url: video.url,
      local_path: null,
      extraction_status: 'linked',
      metadata: {
        lecture_number: video.lectureNumber,
        local_manifest: relative(WORKSPACE_ROOT, video.sourceFile)
      }
    });
  }

  return dedupeMaterials(materials);
}

function replaceLocalMaterials(courseId, materials) {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM materials WHERE course_id = ? AND source_kind = ?');
  const insertStmt = db.prepare(`
    INSERT INTO materials (
      course_id,
      lecture_id,
      type,
      title,
      material_type,
      media_type,
      source_kind,
      resource_id,
      resource_path,
      source_url,
      local_path,
      extraction_status,
      metadata_json,
      created_at
    )
    VALUES (
      @course_id,
      NULL,
      @type,
      @title,
      @material_type,
      @media_type,
      @source_kind,
      @resource_id,
      @resource_path,
      @source_url,
      @local_path,
      @extraction_status,
      @metadata_json,
      CURRENT_TIMESTAMP
    )
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(courseId, LOCAL_SOURCE_KIND);
    for (const material of materials) {
      insertStmt.run({
        ...material,
        metadata_json: JSON.stringify(material.metadata || {})
      });
    }
  });

  tx();
}

function restorePreservedStatus(courseId, existingCourse) {
  const preservedStatus = getPreservedStatus(existingCourse);
  if (!preservedStatus) return;

  getDb().prepare(`
    UPDATE courses
    SET status = @status
    WHERE course_id = @course_id
  `).run({
    course_id: courseId,
    status: preservedStatus
  });
}

function getPreservedStatus(course) {
  if (!course) return null;
  if (PRESERVED_NOTEBOOKLM_STATUSES.has(course.status)) return course.status;
  if (PRESERVED_NOTEBOOKLM_STATUSES.has(course.notebooklm_status)) return course.notebooklm_status;
  return null;
}

async function safeRescreen(courseId, options) {
  try {
    return await screenCourse(courseId, { deep: !options.fast });
  } catch (err) {
    return { courseId, error: err.message };
  }
}

async function walkFiles(root) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await walk(root);
  return files.sort();
}

async function loadLectureTopics(dir) {
  const file = join(dir, 'FILELIST.md');
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    return new Map();
  }

  const topics = new Map();
  for (const line of content.split('\n')) {
    const cells = parseMarkdownTableLine(line);
    if (cells.length < 4 || !/^\d+/.test(cells[0])) continue;
    topics.set(cells[1], {
      lectureNumber: Number.parseInt(cells[0], 10),
      topic: cells[3]
    });
  }

  return topics;
}

async function loadLectureVideoLinks(dir) {
  const file = join(dir, 'LECTURE_VIDEOS.md');
  let content;
  try {
    content = await readFile(file, 'utf8');
  } catch {
    return [];
  }

  const videos = [];
  let currentTitle = null;
  let currentLectureNumber = null;

  for (const line of content.split('\n')) {
    const heading = line.match(/^##\s+Lecture\s+(\d+):?\s*(.*)$/i);
    if (heading) {
      currentLectureNumber = Number.parseInt(heading[1], 10);
      currentTitle = heading[2] || `Lecture ${currentLectureNumber}`;
      continue;
    }

    const url = line.match(/https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/\S+/i)?.[0];
    if (url) {
      videos.push({
        title: currentTitle || url,
        lectureNumber: currentLectureNumber,
        url,
        sourceFile: file
      });
    }
  }

  return videos;
}

function classifyLocalFile(file, lectureTopics) {
  const fileName = basename(file);
  const ext = extname(fileName).toLowerCase();
  const lower = fileName.toLowerCase();

  if (ext === '.json') {
    return {
      title: fileName,
      materialType: 'Other',
      mediaType: 'data',
      inferredFrom: 'file_extension'
    };
  }

  if (ext === '.html') {
    return {
      title: fileName,
      materialType: 'Other',
      mediaType: 'html',
      inferredFrom: 'file_extension'
    };
  }

  if (ext === '.md') {
    return {
      title: fileName,
      materialType: lower.includes('resource') || lower.includes('reading') ? 'Readings' : 'Other',
      mediaType: 'markdown',
      inferredFrom: 'file_extension'
    };
  }

  if (ext !== '.pdf') return null;

  const lectureInfo = lectureTopics.get(fileName);
  const lectureNumber = lectureInfo?.lectureNumber || extractLectureNumber(fileName);
  const title = lectureInfo?.topic
    ? `Lecture ${lectureInfo.lectureNumber}: ${lectureInfo.topic}`
    : titleFromFilename(fileName);

  return {
    title,
    lectureNumber,
    materialType: classifyPdfMaterialType(fileName),
    mediaType: 'pdf',
    inferredFrom: lectureInfo ? 'FILELIST.md' : 'filename'
  };
}

function classifyPdfMaterialType(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes('lec') || lower.includes('lecture')) return 'Lecture Slides';
  if (lower.includes('hw') || lower.includes('problem') || lower.includes('pset')) return 'Problem Sets';
  if (lower.includes('exam') || lower.includes('final') || lower.includes('midterm') || lower.includes('quiz')) return 'Exams';
  if (lower.includes('transcript')) return 'Lecture Videos';
  if (lower.includes('arxiv')) return 'Readings';
  return 'Readings';
}

function inferLearningResourceTypes(materials) {
  return [...new Set(materials.map(material => material.material_type).filter(Boolean))];
}

function dedupeMaterials(materials) {
  const seen = new Set();
  return materials.filter(material => {
    const key = [material.local_path, material.source_url, material.material_type, material.title].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseMarkdownTableLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || trimmed.includes('---')) return [];
  return trimmed
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim());
}

function extractLectureNumber(fileName) {
  return Number.parseInt(fileName.match(/lec(?:ture)?[_\s-]?(\d+)/i)?.[1], 10) || null;
}

function titleFromFilename(fileName) {
  return fileName
    .replace(extname(fileName), '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromFolder(folderName) {
  return folderName
    .replace(/^MIT-/, '')
    .replace(/^MAS\.S60-/, 'MAS.S60 ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyCourseFolder(folderName) {
  return folderName
    .replace(/^MIT-/, '')
    .replace(/\./g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function inferDepartmentNumbers(courseId) {
  const first = courseId.split('-')[0];
  if (first === 'res' && courseId.startsWith('res-10-002')) return ['RES.10-002'];
  if (first === 'mas') return ['MAS.S60'];
  if (/^\d+$/.test(first)) return [first];
  return [];
}

function inferTerm(courseId) {
  if (courseId.includes('fall')) return 'Fall';
  if (courseId.includes('spring')) return 'Spring';
  if (courseId.includes('january-iap')) return 'January IAP';
  return null;
}

function inferYear(courseId) {
  return courseId.match(/(?:fall|spring|january-iap)-(\d{4})/)?.[1] || null;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mergeValues(left = [], right = []) {
  return [...new Set([...left, ...right].filter(Boolean))];
}

function getOptionValue(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

function getPositiveIntegerOption(args, name, fallback) {
  const value = Number.parseInt(getOptionValue(args, name), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export default {
  getLocalImportOptions,
  importLocalLibrary,
  printLocalImportResults
};
