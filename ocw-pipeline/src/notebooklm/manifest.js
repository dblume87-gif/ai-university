import { spawnSync } from 'child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  getCourse,
  getAllCourses,
  getCourseMaterials,
  getDb,
  markNotebookLmUploaded,
  updateCourseStatus,
  updateNotebookLmExport
} from '../lib/db.js';
import { SCREENING_STATUS } from '../lib/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_ROOT = join(__dirname, '../..');
const WORKSPACE_ROOT = join(SCRAPER_ROOT, '..');
const DEFAULT_OUTPUT_ROOT = join(SCRAPER_ROOT, 'output', 'notebooklm');
const DEFAULT_SOURCE_LIMIT = 50;
const DEFAULT_ASSET_TYPES = [
  'audio',
  'video',
  'cinematic-video',
  'slide-deck',
  'infographic',
  'report',
  'mind-map',
  'data-table',
  'flashcards',
  'quiz'
];

const SOURCE_PRIORITY = {
  pdf: 1,
  youtube: 2,
  video: 3,
  captions: 4,
  html: 5,
  slides: 6,
  external: 7,
  data: 8,
  code: 9,
  archive: 10,
  other: 11
};

export function getNotebookLmOptions(args) {
  return {
    courseId: getCourseArg(args),
    limit: getIntegerOption(args, '--limit') || 10,
    maxSources: getIntegerOption(args, '--max-sources') || DEFAULT_SOURCE_LIMIT,
    outDir: getOptionValue(args, '--out'),
    includeHold: args.includes('--include-hold'),
    markReady: args.includes('--mark-ready'),
    notebookId: getOptionValue(args, '--notebook-id'),
    createNotebook: args.includes('--create'),
    dryRun: args.includes('--dry-run'),
    withMetadata: args.includes('--with-metadata'),
    download: args.includes('--download'),
    force: args.includes('--force'),
    stopOnError: args.includes('--stop-on-error'),
    types: getListOption(args, '--types') || DEFAULT_ASSET_TYPES,
    wait: args.includes('--wait'),
    timeout: getIntegerOption(args, '--timeout') || 120
  };
}

function getCourseArg(args) {
  for (let i = 1; i < args.length; i++) {
    const value = args[i];
    if (['--limit', '--max-sources', '--out', '--notebook-id', '--timeout', '--types'].includes(value)) {
      i++;
      continue;
    }
    if (value.startsWith('--')) continue;
    return value;
  }

  return undefined;
}

function getOptionValue(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : undefined;
}

function getIntegerOption(args, name) {
  const value = Number.parseInt(getOptionValue(args, name), 10);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function getListOption(args, name) {
  const value = getOptionValue(args, name);
  return value
    ? value.split(',').map(item => item.trim()).filter(Boolean)
    : null;
}

function resolveNotebookLmOutputDir(courseId, outDir) {
  return outDir ? resolve(WORKSPACE_ROOT, outDir) : join(DEFAULT_OUTPUT_ROOT, courseId);
}

export function getReadyNotebookLmCourses({ limit = 10, includeHold = false } = {}) {
  const db = getDb();
  const holdClause = includeHold ? '' : "AND c.status != 'hold'";

  return db.prepare(`
    SELECT
      c.course_id,
      c.title,
      c.status,
      c.tier,
      c.tier_score,
      c.warnings,
      c.notebooklm_status,
      c.notebooklm_manifest_path,
      COUNT(m.id) AS source_count,
      SUM(CASE WHEN m.media_type = 'pdf' THEN 1 ELSE 0 END) AS pdf_count,
      SUM(CASE WHEN m.media_type IN ('youtube', 'video') THEN 1 ELSE 0 END) AS video_count,
      SUM(CASE WHEN m.media_type IN ('html', 'external', 'slides') THEN 1 ELSE 0 END) AS link_count
    FROM courses c
    JOIN materials m ON m.course_id = c.course_id
    WHERE c.tier IN (1, 2)
      ${holdClause}
      AND c.status NOT IN ('rejected', 'needs_fix')
      AND m.source_url IS NOT NULL
      AND m.media_type NOT IN ('archive', 'code')
    GROUP BY c.course_id
    HAVING source_count >= 2
       AND (pdf_count > 0 OR video_count > 0 OR link_count > 0)
    ORDER BY
      CASE c.status
        WHEN 'approved_for_notebooklm' THEN 1
        WHEN 'ready_for_notebooklm' THEN 2
        WHEN 'selected' THEN 3
        ELSE 4
      END,
      c.tier ASC,
      c.tier_score DESC,
      source_count DESC
    LIMIT @limit
  `).all({ limit });
}

export function printReadyNotebookLmCourses(courses) {
  console.log('\n=== NotebookLM Ready Candidates ===\n');

  if (courses.length === 0) {
    console.log('Keine Kandidaten gefunden. Fuehre zuerst ein Deep Screening aus.');
    return;
  }

  for (const course of courses) {
    console.log(`${course.course_id}`);
    console.log(`  ${course.title}`);
    console.log(`  status=${course.status} tier=${course.tier} score=${course.tier_score} sources=${course.source_count} pdfs=${course.pdf_count} videos=${course.video_count} links=${course.link_count}`);
    if (course.notebooklm_status) {
      console.log(`  notebooklm=${course.notebooklm_status} manifest=${course.notebooklm_manifest_path || '-'}`);
    }
    console.log('');
  }
}

export function approveCourseForNotebookLm(courseId) {
  const course = requireCourse(courseId);
  const changes = updateCourseStatus(course.course_id, SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM);
  if (!changes) throw new Error(`Kurs nicht gefunden: ${courseId}`);
  return { ...course, status: SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM };
}

export async function exportNotebookLmManifest(courseId, options = {}) {
  const course = requireCourse(courseId);
  const materials = getCourseMaterials(courseId);
  const sources = selectNotebookLmSources(materials, options.maxSources || DEFAULT_SOURCE_LIMIT);
  const qa = buildQa(course, materials, sources);
  const status = qa.blocking.length > 0
    ? SCREENING_STATUS.NEEDS_FIX
    : course.status === SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM
      ? SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM
      : SCREENING_STATUS.READY_FOR_NOTEBOOKLM;

  if (qa.blocking.length === 0 && options.markReady && course.status !== SCREENING_STATUS.APPROVED_FOR_NOTEBOOKLM) {
    updateCourseStatus(courseId, SCREENING_STATUS.READY_FOR_NOTEBOOKLM);
  }

  const outDir = resolveNotebookLmOutputDir(courseId, options.outDir);
  await mkdir(outDir, { recursive: true });

  const manifest = {
    generated_at: new Date().toISOString(),
    target: 'notebooklm',
    upload_mode: 'source_manifest',
    notebooklm_api_note: 'Personal NotebookLM can use this as a manual upload queue. NotebookLM Enterprise can map these sources to its notebook/source API.',
    course: normalizeCourse(course, status),
    qa,
    source_limits: {
      max_sources: options.maxSources || DEFAULT_SOURCE_LIMIT,
      exported_sources: sources.length,
      total_materials: materials.length
    },
    sources
  };

  const manifestPath = join(outDir, 'notebooklm_manifest.json');
  const queuePath = join(outDir, 'UPLOAD_QUEUE.md');
  const uploadLogPath = join(outDir, 'notebooklm_upload_log.json');

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(queuePath, renderUploadQueue(manifest), 'utf8');

  if (!options.dryRun) {
    updateNotebookLmExport(courseId, {
      status,
      manifestPath: relative(WORKSPACE_ROOT, manifestPath),
      sourceCount: sources.length,
      notebookId: options.notebookId || null
    });
  }

  return {
    course,
    status,
    sourceCount: sources.length,
    manifestPath,
    queuePath,
    uploadLogPath,
    qa
  };
}

export async function uploadNotebookLmManifest(courseId, options = {}) {
  const exportResult = await exportNotebookLmManifest(courseId, options);
  const manifest = JSON.parse(await readFile(exportResult.manifestPath, 'utf8'));
  const notebookTitle = manifest.course.title;
  let notebookId = options.notebookId || null;
  const uploadLog = {
    generated_at: new Date().toISOString(),
    dry_run: Boolean(options.dryRun),
    course_id: courseId,
    notebook_id: notebookId,
    notebook_created: false,
    create_command: null,
    source_summary: {
      total: manifest.sources.length,
      added: 0,
      ready: 0,
      failed: 0,
      dry_run: options.dryRun ? manifest.sources.length : 0
    },
    sources: []
  };

  if (manifest.qa.blocking.length > 0) {
    throw new Error(`NotebookLM Upload blockiert: ${manifest.qa.blocking.join('; ')}`);
  }

  if (options.createNotebook && !notebookId) {
    const createArgs = ['create', notebookTitle, '--json'];
    uploadLog.create_command = formatNotebookLmCommand(createArgs);

    if (!options.dryRun) {
      const created = runNotebookLmJson(createArgs);
      notebookId = extractNotebookId(created);
      if (!notebookId) {
        throw new Error(`NotebookLM create lieferte keine Notebook-ID: ${JSON.stringify(created).slice(0, 300)}`);
      }
      uploadLog.notebook_id = notebookId;
      uploadLog.notebook_created = true;
      uploadLog.notebook_create_result = created;
    }
  }

  if (!notebookId && !options.dryRun) {
    throw new Error('Keine Notebook-ID angegeben. Nutze --notebook-id <id> oder --create.');
  }

  const targetNotebookId = notebookId || (options.dryRun && options.createNotebook ? '<created-notebook-id>' : null);

  for (const source of manifest.sources) {
    const args = buildSourceAddArgs(source, targetNotebookId);
    const entry = {
      order: source.order,
      title: source.title,
      source_url: source.source_url,
      local_path: source.local_path,
      content: getSourceContent(source),
      command: formatNotebookLmCommand(args),
      status: options.dryRun ? 'dry_run' : 'pending'
    };

    if (!options.dryRun) {
      try {
        const result = runNotebookLmJson(args);
        entry.status = 'added';
        entry.result = result;
        entry.source_id = extractSourceId(result);
        uploadLog.source_summary.added++;

        if (options.wait && entry.source_id) {
          const waitArgs = ['source', 'wait', entry.source_id, '--timeout', String(options.timeout), '--json'];
          if (notebookId) waitArgs.push('--notebook', notebookId);
          entry.wait_command = formatNotebookLmCommand(waitArgs);
          entry.wait_result = runNotebookLmJson(waitArgs);
          entry.status = 'ready';
          uploadLog.source_summary.ready++;
        }
      } catch (err) {
        entry.status = 'error';
        entry.error = err.message;
        uploadLog.source_summary.failed++;
      }
    }

    uploadLog.sources.push(entry);

    if (!options.dryRun && entry.status === 'error' && options.stopOnError) {
      uploadLog.stopped_early = true;
      break;
    }
  }

  await writeFile(exportResult.uploadLogPath, `${JSON.stringify(uploadLog, null, 2)}\n`, 'utf8');

  if (!options.dryRun) {
    const manifestPath = relative(WORKSPACE_ROOT, exportResult.manifestPath);

    if (uploadLog.source_summary.failed === 0) {
      markNotebookLmUploaded(courseId, {
        notebookId,
        sourceCount: uploadLog.source_summary.added,
        manifestPath
      });
    } else {
      updateCourseStatus(courseId, SCREENING_STATUS.NEEDS_FIX);
      updateNotebookLmExport(courseId, {
        status: SCREENING_STATUS.NEEDS_FIX,
        manifestPath,
        sourceCount: uploadLog.source_summary.added,
        notebookId
      });
    }
  }

  return {
    ...exportResult,
    notebookId,
    uploadLogPath: exportResult.uploadLogPath,
    uploadedSources: options.dryRun ? uploadLog.sources.length : uploadLog.source_summary.added,
    failedSources: uploadLog.source_summary.failed,
    dryRun: Boolean(options.dryRun)
  };
}

export function syncNotebookLmCourses(options = {}) {
  const notebooksResult = runNotebookLmJson(['list', '--json']);
  const notebooks = options.withMetadata
    ? enrichNotebooksWithMetadata(notebooksResult.notebooks || [])
    : notebooksResult.notebooks || [];
  const courses = getAllCourses();
  const matches = matchNotebooksToCourses(notebooks, courses);
  const primaryByCourse = choosePrimaryMatches(matches.filter(match => match.course));
  const updated = [];

  for (const match of primaryByCourse) {
    const sourceCount = match.notebook.sources?.length ?? null;

    if (!options.dryRun) {
      markNotebookLmUploaded(match.course.course_id, {
        notebookId: match.notebook.id,
        sourceCount
      });
    }

    updated.push({ ...match, source_count: sourceCount });
  }

  return {
    dryRun: Boolean(options.dryRun),
    totalNotebooks: notebooks.length,
    matched: matches.filter(match => match.course),
    unmatched: matches.filter(match => !match.course),
    primary: updated,
    duplicates: findDuplicateMatches(matches),
    updated
  };
}

export function printNotebookLmSyncResult(result) {
  console.log('\n=== NotebookLM Sync ===\n');
  console.log(`Online Notebooks: ${result.totalNotebooks}`);
  console.log(`Matched Courses: ${result.primary.length}`);
  console.log(`Unmatched Notebooks: ${result.unmatched.length}`);
  console.log(`Mode: ${result.dryRun ? 'dry-run' : 'updated library.db'}`);
  console.log('');

  for (const match of result.primary) {
    const sourceText = match.source_count === undefined ? '' : ` sources=${match.source_count ?? '?'}`;
    console.log(`[match:${match.confidence}] ${match.course.course_id}${sourceText}`);
    console.log(`  ${match.notebook.title}`);
    console.log(`  notebook=${match.notebook.id}`);
  }

  if (result.duplicates.length > 0) {
    console.log('\nDuplicates:');
    for (const duplicate of result.duplicates) {
      console.log(`  ${duplicate.course_id}`);
      for (const match of duplicate.matches) {
        console.log(`    - ${match.notebook.id} ${match.notebook.title}`);
      }
    }
  }

  if (result.unmatched.length > 0) {
    console.log('\nUnmatched:');
    for (const match of result.unmatched) {
      console.log(`  - ${match.notebook.id} ${match.notebook.title || '(untitled)'}`);
    }
  }
}

export async function indexNotebookLmAssets(options = {}) {
  const courses = getNotebookLmAssetCourses(options);
  const indexedAt = new Date().toISOString();
  const courseResults = [];
  const assetRoot = join(DEFAULT_OUTPUT_ROOT, 'assets');

  await mkdir(assetRoot, { recursive: true });

  for (const course of courses) {
    const courseDir = join(assetRoot, course.course_id);
    await mkdir(courseDir, { recursive: true });

    const artifacts = listNotebookLmArtifacts(course);
    const downloads = options.download
      ? downloadNotebookLmAssets(course, courseDir, options)
      : [];
    const localFiles = await listLocalFiles(courseDir);

    courseResults.push({
      course_id: course.course_id,
      title: course.title,
      notebook_id: course.notebooklm_notebook_id,
      notebook_title: artifacts.notebook_title || null,
      artifact_count: artifacts.artifacts.length,
      artifacts: artifacts.artifacts,
      downloads,
      local_dir: relative(WORKSPACE_ROOT, courseDir),
      local_files: localFiles
    });
  }

  const index = {
    generated_at: indexedAt,
    asset_root: relative(WORKSPACE_ROOT, assetRoot),
    course_count: courseResults.length,
    artifact_count: courseResults.reduce((sum, course) => sum + course.artifact_count, 0),
    local_file_count: courseResults.reduce((sum, course) => sum + course.local_files.length, 0),
    courses: courseResults
  };

  const indexPath = join(assetRoot, 'index.json');
  const markdownPath = join(assetRoot, 'INDEX.md');
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, renderAssetIndex(index), 'utf8');

  return { ...index, indexPath, markdownPath };
}

export function printNotebookLmAssetIndex(result) {
  console.log('\n=== NotebookLM Asset Index ===\n');
  console.log(`Courses: ${result.course_count}`);
  console.log(`Artifacts: ${result.artifact_count}`);
  console.log(`Local files: ${result.local_file_count}`);
  console.log(`Index: ${result.indexPath}`);
  console.log(`Markdown: ${result.markdownPath}`);
  console.log('');

  for (const course of result.courses) {
    console.log(`${course.course_id}`);
    console.log(`  ${course.title}`);
    console.log(`  notebook=${course.notebook_id} artifacts=${course.artifact_count} local_files=${course.local_files.length}`);
  }
}

function requireCourse(courseId) {
  const course = getCourse(courseId);
  if (!course) throw new Error(`Kurs nicht gefunden: ${courseId}`);
  return course;
}

function getNotebookLmAssetCourses(options = {}) {
  const courses = getAllCourses()
    .filter(course => course.notebooklm_notebook_id);

  if (options.courseId) {
    return courses.filter(course => course.course_id === options.courseId);
  }

  if (options.notebookId) {
    return courses.filter(course => course.notebooklm_notebook_id?.startsWith(options.notebookId));
  }

  return courses;
}

function listNotebookLmArtifacts(course) {
  try {
    return runNotebookLmJson(['artifact', 'list', '--notebook', course.notebooklm_notebook_id, '--json']);
  } catch (err) {
    return {
      notebook_id: course.notebooklm_notebook_id,
      notebook_title: course.title,
      artifacts: [],
      count: 0,
      error: err.message
    };
  }
}

function downloadNotebookLmAssets(course, courseDir, options = {}) {
  const downloads = [];

  for (const type of options.types || DEFAULT_ASSET_TYPES) {
    const typeDir = join(courseDir, type);
    const args = ['download', type, '--notebook', course.notebooklm_notebook_id, '--all', typeDir, '--json'];
    args.push(options.force ? '--force' : '--no-clobber');
    if (options.dryRun) args.push('--dry-run');

    try {
      const result = runNotebookLmJson(args);
      downloads.push({
        type,
        status: result.error ? 'empty' : 'ok',
        result
      });
    } catch (err) {
      const message = err.message || '';
      const missing = message.includes('No completed') || message.includes('No artifacts');
      downloads.push({
        type,
        status: missing ? 'empty' : 'error',
        message
      });
    }
  }

  return downloads;
}

async function listLocalFiles(rootDir) {
  const files = [];

  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        const info = await stat(path);
        files.push({
          path: relative(WORKSPACE_ROOT, path),
          bytes: info.size,
          modified_at: info.mtime.toISOString()
        });
      }
    }
  }

  await walk(rootDir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function selectNotebookLmSources(materials, maxSources) {
  return materials
    .filter(hasSourceContent)
    .filter(material => !['archive', 'code'].includes(material.media_type))
    .sort((a, b) => {
      const priorityA = getSourcePriority(a);
      const priorityB = getSourcePriority(b);
      if (priorityA !== priorityB) return priorityA - priorityB;
      const lectureA = getLectureNumber(a);
      const lectureB = getLectureNumber(b);
      if (lectureA !== null && lectureB !== null && lectureA !== lectureB) return lectureA - lectureB;
      return a.id - b.id;
    })
    .slice(0, maxSources)
    .map((material, index) => ({
      order: index + 1,
      title: material.title,
      source_url: material.source_url,
      content: getSourceContent(material),
      source_kind: material.source_kind,
      material_type: material.material_type,
      media_type: material.media_type,
      local_path: material.local_path,
      extraction_status: material.extraction_status,
      notebooklm_source_type: mapNotebookLmSourceType(material),
      metadata: parseJson(material.metadata_json)
    }));
}

function getSourcePriority(material) {
  let priority = SOURCE_PRIORITY[material.media_type] || SOURCE_PRIORITY.other;
  const title = String(material.title || '').toLowerCase();
  const materialType = String(material.material_type || '').toLowerCase();

  if (material.media_type === 'pdf') {
    if (materialType.includes('lecture slides') || title.includes('lecture ')) priority -= 0.4;
    if (materialType.includes('lecture notes') || title.includes('notes')) priority -= 0.3;
    if (title.includes('transcript') || title.includes('3play')) priority += 1.5;
  }

  return priority;
}

function getLectureNumber(material) {
  const match = String(material.title || '').match(/\blecture\s+(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function mapNotebookLmSourceType(material) {
  if (material.local_path) return 'file';
  if (material.media_type === 'pdf') return 'file_or_url';
  if (material.media_type === 'youtube') return 'youtube';
  if (material.media_type === 'video') return 'video_url';
  if (['html', 'external', 'slides'].includes(material.media_type)) return 'website_url';
  if (material.media_type === 'captions') return 'text_or_file';
  return 'url';
}

function buildSourceAddArgs(source, notebookId) {
  const content = getSourceContent(source);
  if (!content) throw new Error(`Quelle ohne content/source_url/local_path: ${source.title || '(untitled)'}`);

  const args = ['source', 'add', content, '--json'];
  if (notebookId) args.push('--notebook', notebookId);

  const title = getSourceTitle(source);
  if (title) args.push('--title', title);

  const sourceType = getNotebookLmCliSourceType(source);
  if (sourceType) args.push('--type', sourceType);

  const mimeType = getSourceMimeType(source, content);
  if (mimeType) args.push('--mime-type', mimeType);

  return args;
}

function hasSourceContent(material) {
  return Boolean(getSourceContent(material));
}

function getSourceContent(source) {
  return source.local_path || source.source_url || source.content || null;
}

function getSourceTitle(source) {
  return source.title || source.resource_path || source.local_path || source.source_url || null;
}

function getNotebookLmCliSourceType(source) {
  if (source.media_type === 'youtube') return 'youtube';
  if (source.local_path) return 'file';
  if (isYoutubeUrl(source.source_url)) return 'youtube';
  if (source.source_url?.startsWith('http')) return 'url';
  return null;
}

function getSourceMimeType(source, content) {
  if (!source.local_path || getNotebookLmCliSourceType(source) !== 'file') return null;
  const extension = extname(content).toLowerCase();
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.csv': 'text/csv'
  };
  return mimeTypes[extension] || null;
}

function isYoutubeUrl(url) {
  return Boolean(url && /(?:youtube\.com|youtu\.be)/i.test(url));
}

function matchNotebooksToCourses(notebooks, courses) {
  return notebooks.map(notebook => {
    const ranked = courses
      .map(course => scoreNotebookCourseMatch(notebook, course))
      .filter(match => match.confidence >= 0.55)
      .sort((a, b) => b.confidence - a.confidence);

    return ranked[0] || {
      notebook,
      course: null,
      confidence: 0,
      reasons: []
    };
  });
}

function enrichNotebooksWithMetadata(notebooks) {
  return notebooks.map(notebook => {
    try {
      const metadata = runNotebookLmJson(['metadata', '--notebook', notebook.id, '--json']);
      return { ...notebook, sources: metadata.sources || [] };
    } catch (err) {
      return { ...notebook, sources: [], metadata_error: err.message };
    }
  });
}

function scoreNotebookCourseMatch(notebook, course) {
  const title = normalizeMatchText(notebook.title);
  const courseTitle = normalizeMatchText(course.title);
  const courseCode = getCourseCode(course.course_id);
  const codeVariants = getCourseCodeVariants(courseCode);
  const sourceText = normalizeMatchText((notebook.sources || []).map(source => source.title).join(' '));
  const sourceCodeVariants = getSourceCodeVariants(courseCode);
  let confidence = 0;
  const reasons = [];

  for (const variant of codeVariants) {
    if (variant && title.includes(normalizeMatchText(variant))) {
      confidence += 0.65;
      reasons.push(`code:${variant}`);
      break;
    }
  }

  for (const variant of sourceCodeVariants) {
    if (variant && hasNormalizedSourceCode(sourceText, variant)) {
      confidence += 0.65;
      reasons.push(`source-code:${variant}`);
      break;
    }
  }

  if (courseTitle && title.includes(courseTitle)) {
    confidence += 0.45;
    reasons.push('title:exact');
  } else {
    const overlap = wordOverlap(title, courseTitle);
    if (overlap >= 0.8) {
      confidence += 0.35;
      reasons.push('title:strong');
    } else if (overlap >= 0.55) {
      confidence += 0.2;
      reasons.push('title:partial');
    }
  }

  if (title.includes('mit')) {
    confidence += 0.05;
    reasons.push('mit');
  }

  if (reasons.some(reason => reason.startsWith('source-code:')) &&
      !reasons.some(reason => reason.startsWith('code:') || reason.startsWith('title:')) &&
      (notebook.sources?.length || 0) < 2) {
    confidence = Math.min(confidence, 0.5);
    reasons.push('too-few-sources');
  }

  return {
    notebook,
    course,
    confidence: Number(Math.min(confidence, 1).toFixed(2)),
    reasons
  };
}

function choosePrimaryMatches(matches) {
  const byCourse = new Map();
  for (const match of matches) {
    const current = byCourse.get(match.course.course_id);
    if (!current || compareMatch(match, current) < 0) {
      byCourse.set(match.course.course_id, match);
    }
  }

  return [...byCourse.values()].sort((a, b) => a.course.course_id.localeCompare(b.course.course_id));
}

function compareMatch(a, b) {
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  const aHasCode = a.reasons.some(reason => reason.startsWith('code:'));
  const bHasCode = b.reasons.some(reason => reason.startsWith('code:'));
  if (aHasCode !== bHasCode) return aHasCode ? -1 : 1;
  return String(a.notebook.created_at || '').localeCompare(String(b.notebook.created_at || ''));
}

function findDuplicateMatches(matches) {
  const byCourse = new Map();
  for (const match of matches.filter(item => item.course)) {
    const id = match.course.course_id;
    byCourse.set(id, [...(byCourse.get(id) || []), match]);
  }

  return [...byCourse.entries()]
    .filter(([, courseMatches]) => courseMatches.length > 1)
    .map(([courseId, courseMatches]) => ({
      course_id: courseId,
      matches: courseMatches.sort(compareMatch)
    }));
}

function getCourseCode(courseId) {
  const parts = String(courseId || '').split('-');
  if (parts[0] === 'mas' && parts[1]) return `MAS.${parts[1].toUpperCase()}`;
  if (parts[0] === 'res' && parts[1] && parts[2]) return `RES.${parts[1]}.${parts[2]}`;
  if (/^\d+$/.test(parts[0]) && parts[1]) return `${parts[0]}.${parts[1].toUpperCase()}`;
  return parts.slice(0, 2).join('-').toUpperCase();
}

function getCourseCodeVariants(code) {
  if (!code) return [];
  const variants = new Set([code, code.replace('.', '-'), code.replace('.', ' ')]);

  if (/^\d+\.\d{4}$/.test(code)) {
    variants.add(code.replace(/\.0+/, '.'));
    variants.add(code.replace(/\.0+/, '-'));
  }

  return [...variants];
}

function getSourceCodeVariants(code) {
  if (!code) return [];
  const compact = code.replace('.', '_').replace('-', '_');
  return [
    `MIT${compact}`
  ];
}

function hasNormalizedSourceCode(text, value) {
  const normalizedValue = normalizeMatchText(value);
  const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^| )${escaped}[a-z0-9]*( |$)`).test(text);
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(a, b) {
  const ignore = new Set(['mit', 'the', 'and', 'of', 'to', 'in', 'for', 'with', 'an', 'a']);
  const wordsA = new Set(a.split(' ').filter(word => word && !ignore.has(word)));
  const wordsB = b.split(' ').filter(word => word && !ignore.has(word));
  if (wordsB.length === 0) return 0;
  return wordsB.filter(word => wordsA.has(word)).length / wordsB.length;
}

function runNotebookLmJson(args) {
  const result = spawnSync('notebooklm', args, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`notebooklm ${args.join(' ')} fehlgeschlagen: ${result.stderr || result.stdout}`);
  }

  const output = result.stdout.trim();
  if (!output) return {};

  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`notebooklm ${args.join(' ')}: ungültige JSON-Ausgabe: ${output.slice(0, 200)}`);
  }
}

function formatNotebookLmCommand(args) {
  return ['notebooklm', ...args].map(shellQuote).join(' ');
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function extractNotebookId(result) {
  return result.id || result.notebook_id || result.notebookId || result.notebook?.id;
}

function extractSourceId(result) {
  return result.id || result.source_id || result.sourceId || result.source?.id;
}

function buildQa(course, materials, sources) {
  const warnings = [];
  const blocking = [];
  const counts = countBy(materials, 'media_type');
  const sourceCounts = countBy(sources, 'media_type');
  const uploadableMaterials = materials
    .filter(hasSourceContent)
    .filter(material => !['archive', 'code'].includes(material.media_type));
  const missingContent = materials.filter(material => !hasSourceContent(material)).length;

  if (!course.title || course.title === 'Unknown') blocking.push('Kurstitel fehlt.');
  if (materials.length === 0) blocking.push('Keine Materialien in library.db gefunden. Deep Screening ausfuehren.');
  if (sources.length === 0) blocking.push('Keine NotebookLM-tauglichen Quellen gefunden.');
  if (!sourceCounts.pdf && !sourceCounts.youtube && !sourceCounts.video && !sourceCounts.html && !sourceCounts.external && !sourceCounts.slides) {
    blocking.push('Quellenmix enthaelt keine PDFs, Videos oder Webseiten.');
  }
  if (sources.length < uploadableMaterials.length) {
    warnings.push(`${uploadableMaterials.length - sources.length} uploadbare Materialien wurden wegen Source-Limit nicht exportiert.`);
  }
  if (missingContent > 0) {
    warnings.push(`${missingContent} Materialien haben weder source_url noch local_path und wurden nicht exportiert.`);
  }
  if ((counts.external || 0) > (counts.pdf || 0) + (counts.html || 0)) {
    warnings.push('Viele externe Quellen: vor Upload stichprobenartig pruefen.');
  }

  return {
    status: blocking.length > 0 ? 'needs_fix' : 'ready',
    blocking,
    warnings,
    material_counts: counts,
    source_counts: sourceCounts
  };
}

function normalizeCourse(course, status) {
  return {
    course_id: course.course_id,
    title: course.title,
    source_url: course.source_url,
    term: course.term,
    year: course.year,
    level: parseJson(course.level),
    topics: parseJson(course.topics),
    instructors: parseJson(course.instructors),
    status,
    tier: course.tier,
    tier_score: course.tier_score,
    screening_reason: course.screening_reason,
    warnings: parseJson(course.warnings)
  };
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field] || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function renderUploadQueue(manifest) {
  const lines = [
    `# NotebookLM Upload Queue: ${manifest.course.title}`,
    '',
    `Course ID: ${manifest.course.course_id}`,
    `Status: ${manifest.course.status}`,
    `Sources: ${manifest.source_limits.exported_sources}/${manifest.source_limits.total_materials}`,
    '',
    '## QA',
    '',
    `Blocking: ${manifest.qa.blocking.length ? manifest.qa.blocking.join('; ') : 'none'}`,
    `Warnings: ${manifest.qa.warnings.length ? manifest.qa.warnings.join('; ') : 'none'}`,
    '',
    '## Sources',
    ''
  ];

  for (const source of manifest.sources) {
    lines.push(`${source.order}. [${source.media_type}] ${source.title}`);
    lines.push(`   ${getSourceContent(source)}`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function renderAssetIndex(index) {
  const lines = [
    '# NotebookLM Asset Index',
    '',
    `Generated: ${index.generated_at}`,
    `Asset root: \`${index.asset_root}\``,
    `Courses: ${index.course_count}`,
    `Artifacts: ${index.artifact_count}`,
    `Local files: ${index.local_file_count}`,
    '',
    '## Courses',
    ''
  ];

  for (const course of index.courses) {
    lines.push(`### ${course.title}`);
    lines.push('');
    lines.push(`- Course ID: \`${course.course_id}\``);
    lines.push(`- Notebook ID: \`${course.notebook_id}\``);
    lines.push(`- Artifacts: ${course.artifact_count}`);
    lines.push(`- Local files: ${course.local_files.length}`);

    if (course.artifacts.length > 0) {
      lines.push('');
      lines.push('| Type | Title | Status | Created | ID |');
      lines.push('|------|-------|--------|---------|----|');
      for (const artifact of course.artifacts) {
        lines.push(`| ${artifact.type_id || artifact.type || ''} | ${escapeMarkdownTable(artifact.title || '')} | ${artifact.status || ''} | ${artifact.created_at || ''} | \`${artifact.id || ''}\` |`);
      }
    }

    if (course.local_files.length > 0) {
      lines.push('');
      lines.push('Local files:');
      for (const file of course.local_files) {
        lines.push(`- \`${file.path}\` (${file.bytes} bytes)`);
      }
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function escapeMarkdownTable(value) {
  return String(value).replaceAll('|', '\\|');
}
