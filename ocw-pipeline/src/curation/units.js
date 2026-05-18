import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getCourse, getCourseMaterials } from '../lib/db.js';
import { parseCliArgs } from '../lib/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_ROOT = join(__dirname, '../..');
const DEFAULT_OUTPUT_ROOT = join(SCRAPER_ROOT, 'output', 'notebooklm');

const UNITS_SCHEMA = {
  stringFlags: ['--out-root'],
  booleanFlags: ['--assigned-only']
};

const UNIT_SOURCE_MEDIA_TYPES = new Set([
  'pdf',
  'youtube',
  'video',
  'html',
  'external',
  'markdown',
  'slides',
  'data'
]);

export function getCourseUnitOptions(args = []) {
  const parsed = parseCliArgs(args, UNITS_SCHEMA);
  return {
    courseIds: parsed.positional,
    outRoot: parsed.getString('--out-root', DEFAULT_OUTPUT_ROOT),
    includeUnassigned: !parsed.has('--assigned-only')
  };
}

export async function exportCourseUnits(courseIds, options = {}) {
  const results = [];
  for (const courseId of courseIds) {
    const units = buildCourseUnits(courseId, options);
    const outDir = join(options.outRoot || DEFAULT_OUTPUT_ROOT, courseId);
    await mkdir(outDir, { recursive: true });

    const jsonPath = join(outDir, 'course_units.json');
    const markdownPath = join(outDir, 'COURSE_UNITS.md');
    await writeFile(jsonPath, `${JSON.stringify(units, null, 2)}\n`, 'utf8');
    await writeFile(markdownPath, renderCourseUnits(units), 'utf8');

    results.push({
      course_id: courseId,
      title: units.course.title,
      unit_count: units.units.length,
      assigned_sources: units.summary.assigned_sources,
      unassigned_sources: units.summary.unassigned_sources,
      jsonPath,
      markdownPath
    });
  }

  return results;
}

export function buildCourseUnits(courseId, options = {}) {
  const course = getCourse(courseId);
  if (!course) throw new Error(`Kurs nicht gefunden: ${courseId}`);

  const materials = getCourseMaterials(courseId).filter(isRelevantSource);
  const unitMap = new Map();
  const unassigned = [];

  for (const material of materials) {
    const source = normalizeSource(material);
    const unitNumbers = inferUnitNumbers(material);

    if (unitNumbers.length === 0) {
      if (options.includeUnassigned !== false) unassigned.push(source);
      continue;
    }

    for (const unitNumber of unitNumbers) {
      const key = String(unitNumber);
      const existing = unitMap.get(key) || {
        unit_number: unitNumber,
        title: null,
        confidence: 'inferred',
        sources: []
      };

      existing.sources.push({
        ...source,
        unit_match: getUnitMatch(material, unitNumber)
      });
      existing.title = existing.title || inferUnitTitle(material);
      unitMap.set(key, existing);
    }
  }

  const units = [...unitMap.values()]
    .sort((a, b) => compareUnitNumbers(a.unit_number, b.unit_number))
    .map(unit => {
      const sources = unit.sources.sort(compareSources);
      return {
        ...unit,
        title: cleanUnitTitle(chooseUnitTitle(sources) || unit.title, unit.unit_number),
        source_count: sources.length,
        source_types: countBy(sources, 'media_type'),
        sources
      };
    });

  const assignedSourceIds = new Set(units.flatMap(unit => unit.sources.map(source => source.id)));

  return {
    generated_at: new Date().toISOString(),
    course: {
      course_id: course.course_id,
      title: course.title,
      source_url: course.source_url,
      status: course.status,
      notebooklm_status: course.notebooklm_status,
      notebooklm_notebook_id: course.notebooklm_notebook_id
    },
    summary: {
      material_sources: materials.length,
      unit_count: units.length,
      assigned_sources: assignedSourceIds.size,
      unassigned_sources: unassigned.length
    },
    inference_rules: [
      'Lecture/unit numbers are inferred from titles such as "Lecture 7", "Lectures 5 and 6", and file/path tokens such as "lec07" or "Lec04".',
      'Problem sets and quizzes with explicit numbers are attached to the matching unit number.',
      'Sources without a reliable unit signal are kept in unassigned_sources.'
    ],
    units,
    unassigned_sources: unassigned.sort(compareSources)
  };
}

export function printCourseUnitResults(results) {
  console.log('\n=== Course Units Export ===\n');
  for (const result of results) {
    console.log(`${result.course_id}`);
    console.log(`  ${result.title}`);
    console.log(`  units=${result.unit_count} assigned=${result.assigned_sources} unassigned=${result.unassigned_sources}`);
    console.log(`  json=${result.jsonPath}`);
    console.log(`  markdown=${result.markdownPath}`);
    console.log('');
  }
}

function normalizeSource(material) {
  const metadata = parseJson(material.metadata_json, {});
  return {
    id: material.id,
    title: material.title,
    media_type: material.media_type,
    material_type: material.material_type,
    source_url: material.source_url,
    local_path: material.local_path,
    resource_path: material.resource_path,
    parent_title: metadata.parent_title || null,
    learning_resource_types: metadata.learning_resource_types || []
  };
}

export function inferUnitNumbers(material) {
  const metadata = parseJson(material.metadata_json, {});
  const text = [
    material.title,
    material.resource_path,
    material.source_url,
    metadata.parent_title
  ].filter(Boolean).join(' ');

  return uniqueNumbers([
    ...inferMetadataNumbers(metadata),
    ...inferLectureNumbers(text),
    ...inferScheduleSessionNumbers(metadata.session_text),
    ...inferAssessmentNumbers(material)
  ]);
}

function inferMetadataNumbers(metadata) {
  const values = [
    metadata.lecture_number,
    metadata.unit_number,
    ...(Array.isArray(metadata.session_unit_numbers) ? metadata.session_unit_numbers : [])
  ];
  return values.map(value => Number.parseInt(value, 10));
}

function inferLectureNumbers(text) {
  const numbers = [];
  const value = String(text || '');
  const lectureRange = /\blectures?\s+0*(\d{1,3})(?:\s*(?:,|and|&|-|to)\s*0*(\d{1,3}))?/gi;
  const compactLecture = /(?:^|[._\-/\s])lec(?:ture)?[_\-\s]?0*(\d{1,3})(?:\.\d+)?(?:[a-z])?(?=[._\-/\s%]|$)/gi;

  for (const match of value.matchAll(lectureRange)) {
    numbers.push(...expandRange(match[1], match[2]));
  }

  for (const match of value.matchAll(compactLecture)) {
    numbers.push(Number.parseInt(match[1], 10));
  }

  return numbers;
}

function inferScheduleSessionNumbers(text) {
  const value = String(text || '');
  if (!value) return [];

  const numbers = [];
  const normalized = value.replace(/\s+/g, ' ');

  if (/\bWeek\s+1\b/i.test(normalized) && /\bIntroduction\b/i.test(normalized)) {
    numbers.push(1);
  }

  const foundation = /\bFoundation\s+(\d{1,2})\b/i.exec(normalized)?.[1];
  if (foundation) {
    const n = Number.parseInt(foundation, 10);
    if (n === 1) numbers.push(2);
    if (n >= 3) numbers.push(n);
  }

  const multimodal = /\bMultimodal\s+(\d{1,2})\b/i.exec(normalized)?.[1];
  if (multimodal) numbers.push(Number.parseInt(multimodal, 10) + 3);

  const largeModels = /\bLarge\s+models\s+(\d{1,2})\b/i.exec(normalized)?.[1];
  if (largeModels) numbers.push(Number.parseInt(largeModels, 10) + 6);

  if (/\bGenerative\s+AI\b/i.test(normalized)) numbers.push(9);

  const interaction = /\bInteraction\s+(\d{1,2})\b/i.exec(normalized)?.[1];
  if (interaction) numbers.push(Number.parseInt(interaction, 10) + 9);

  return numbers;
}

function inferAssessmentNumbers(material) {
  const title = String(material.title || '');
  const metadata = parseJson(material.metadata_json, {});
  const parentTitle = String(metadata.parent_title || material.material_type || '');
  const assessment = /\b(?:problem\s*set|pset|homework|quiz)\s*#?\s*0*(\d{1,3})\b/i.exec(title);

  if (!assessment) return [];
  if (!/(assignments?|problem|homework|exam|quiz)/i.test(`${parentTitle} ${title}`)) return [];
  return [Number.parseInt(assessment[1], 10)];
}

function getUnitMatch(material, unitNumber) {
  const metadata = parseJson(material.metadata_json, {});
  const text = [material.title, material.resource_path, material.source_url].filter(Boolean).join(' ');
  const padded = String(unitNumber).padStart(2, '0');
  if (inferMetadataNumbers(metadata).includes(unitNumber)) return 'metadata_signal';
  if (new RegExp(`\\blec(?:ture)?[_\\-\\s]?0*${unitNumber}\\b`, 'i').test(text) ||
      new RegExp(`\\blec(?:ture)?[_\\-\\s]?${padded}\\b`, 'i').test(text)) {
    return 'lecture_token';
  }
  if (/\blectures?\b/i.test(text)) return 'lecture_title';
  if (/\b(problem\s*set|pset|homework|quiz)\b/i.test(text)) return 'assessment_number';
  return 'inferred';
}

function inferUnitTitle(material) {
  const title = String(material.title || '').trim();
  if (!title) return null;
  return title
    .replace(/^\s*(?:geobiology,\s*)?lectures?\s+\d+(?:\s*(?:,|and|&|-|to)\s*\d+)?\s*(?:notes?)?\s*[-:—]?\s*/i, '')
    .replace(/^\s*(?:geobiology,\s*)?lecture\s+notes?\s+\d+\s*[-:—]?\s*/i, '')
    .replace(/^\s*lecture\s+\d+(?:\s*background)?\s*notes?\s*[-:—]?\s*/i, '')
    .replace(/^\s*lecture\s+\d+\s*[-:—]\s*/i, '')
    .trim() || title;
}

function chooseUnitTitle(sources) {
  const lectureSource = sources.find(source =>
    /lecture/i.test(`${source.title || ''} ${source.resource_path || ''}`) &&
    !/background notes/i.test(source.title || '')
  ) || sources.find(source => /lecture/i.test(`${source.title || ''} ${source.resource_path || ''}`));

  return lectureSource ? inferUnitTitle(lectureSource) : inferUnitTitle(sources[0]);
}

function cleanUnitTitle(title, unitNumber) {
  if (!title) return `Unit ${unitNumber}`;
  const value = String(title).trim();
  if (/^(notes?|background notes?)$/i.test(value)) return `Unit ${unitNumber}`;
  return value;
}

function isRelevantSource(material) {
  if (!UNIT_SOURCE_MEDIA_TYPES.has(material.media_type)) return false;
  if (!material.source_url && !material.local_path) return false;
  if (['archive', 'code', 'other'].includes(material.media_type)) return false;
  return true;
}

function expandRange(first, second) {
  const start = Number.parseInt(first, 10);
  const end = Number.parseInt(second, 10);
  if (!Number.isInteger(start)) return [];
  if (!Number.isInteger(end) || end === start) return [start];
  if (end < start || end - start > 5) return [start, end];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function uniqueNumbers(values) {
  return [...new Set(values.filter(value => Number.isInteger(value) && value > 0))];
}

function compareUnitNumbers(a, b) {
  return Number(a) - Number(b);
}

function compareSources(a, b) {
  return getSourceSortKey(a).localeCompare(getSourceSortKey(b)) || String(a.title || '').localeCompare(String(b.title || ''));
}

function getSourceSortKey(source) {
  const text = [source.title, source.resource_path, source.source_url].filter(Boolean).join(' ');
  const lecture = inferLectureNumbers(text)[0];
  if (lecture) {
    const lectureKind = /background notes/i.test(source.title || '') ? 'b' : 'a';
    return `a-lecture-${String(lecture).padStart(3, '0')}-${lectureKind}-${source.id}`;
  }
  const assessment = /\b(?:problem\s*set|pset|homework|quiz)\s*#?\s*0*(\d{1,3})\b/i.exec(text)?.[1];
  if (assessment) return `b-assessment-${String(Number.parseInt(assessment, 10)).padStart(3, '0')}-${source.id}`;
  return `z-${source.id}`;
}

function countBy(items, field) {
  return items.reduce((counts, item) => {
    const key = item[field] || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function renderCourseUnits(courseUnits) {
  const lines = [
    `# Course Units: ${String(courseUnits.course.title || '').trim()}`,
    '',
    `Course ID: ${courseUnits.course.course_id}`,
    `NotebookLM: ${courseUnits.course.notebooklm_notebook_id || '-'}`,
    `Units: ${courseUnits.summary.unit_count}`,
    `Assigned Sources: ${courseUnits.summary.assigned_sources}`,
    `Unassigned Sources: ${courseUnits.summary.unassigned_sources}`,
    ''
  ];

  for (const unit of courseUnits.units) {
    lines.push(`## Unit ${unit.unit_number}: ${unit.title}`);
    lines.push('');
    for (const source of unit.sources) {
      const href = source.source_url || source.local_path || '';
      lines.push(`- [${source.media_type}] ${source.title}${href ? ` — ${href}` : ''}`);
    }
    lines.push('');
  }

  if (courseUnits.unassigned_sources.length > 0) {
    lines.push('## Unassigned Sources');
    lines.push('');
    for (const source of courseUnits.unassigned_sources) {
      const href = source.source_url || source.local_path || '';
      lines.push(`- [${source.media_type}] ${source.title}${href ? ` — ${href}` : ''}`);
    }
    lines.push('');
  }

  while (lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export default {
  buildCourseUnits,
  exportCourseUnits,
  getCourseUnitOptions,
  printCourseUnitResults
};
