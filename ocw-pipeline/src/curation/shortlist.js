import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseCliArgs } from '../lib/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../library.db');

const DEFAULT_LIMIT = 5;
const VALID_MATERIAL_FILTERS = new Set(['videos', 'pdfs', 'notes', 'psets', 'exams']);
const VALID_SORTS = new Set(['score', 'videos', 'pdfs', 'notes', 'psets', 'exams', 'title']);

const SHORTLIST_SCHEMA = {
  stringFlags: ['--topic', '--department', '--material', '--sort'],
  intFlags: ['--limit', '--min-videos', '--min-pdfs'],
  booleanFlags: ['--include-hold']
};

export function getShortlistOptions(args = []) {
  const parsed = parseCliArgs(args, SHORTLIST_SCHEMA);
  const options = {
    limit: parsed.getPositiveInt('--limit', DEFAULT_LIMIT),
    topic: parsed.getString('--topic'),
    department: parsed.getString('--department'),
    material: parsed.getString('--material'),
    minVideos: parsed.getPositiveInt('--min-videos', 0),
    minPdfs: parsed.getPositiveInt('--min-pdfs', 0),
    includeHold: parsed.has('--include-hold'),
    sort: parsed.getString('--sort', 'score')
  };

  if (!VALID_SORTS.has(options.sort)) {
    throw new Error(`Unsupported --sort "${options.sort}". Use one of: ${[...VALID_SORTS].join(', ')}`);
  }

  if (options.material && !VALID_MATERIAL_FILTERS.has(options.material)) {
    throw new Error(`Unsupported --material "${options.material}". Use one of: ${[...VALID_MATERIAL_FILTERS].join(', ')}`);
  }

  return options;
}

export function getShortlist(options = {}) {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  let rows;

  try {
    rows = db.prepare(`
      SELECT
        c.course_id,
        c.title,
        c.level,
        c.topics,
        c.department_numbers,
        c.status,
        c.tier,
        c.tier_score,
        COUNT(m.id) AS materials,
        SUM(CASE WHEN m.material_type = 'Lecture Videos' OR m.media_type IN ('youtube', 'video') THEN 1 ELSE 0 END) AS videos,
        SUM(CASE WHEN m.media_type = 'pdf' THEN 1 ELSE 0 END) AS pdfs,
        SUM(CASE WHEN m.material_type IN ('Lecture Notes', 'Lecture Slides') THEN 1 ELSE 0 END) AS notes,
        SUM(CASE WHEN m.material_type = 'Problem Sets' THEN 1 ELSE 0 END) AS psets,
        SUM(CASE WHEN m.material_type = 'Exams' THEN 1 ELSE 0 END) AS exams
      FROM courses c
      LEFT JOIN materials m ON m.course_id = c.course_id
      GROUP BY c.course_id
    `).all();
  } finally {
    db.close();
  }

  return rows
    .map(normalizeCourseRow)
    .filter(row => isCandidate(row, options))
    .map(row => ({
      ...row,
      fit_score: calculateFitScore(row),
      material_mix: calculateMaterialMix(row)
    }))
    .sort(createCourseSorter(options.sort || 'score'))
    .slice(0, options.limit || DEFAULT_LIMIT);
}

export function printShortlist(courses, options = {}) {
  if (courses.length === 0) {
    console.log('No shortlist candidates found for the selected filters.');
    return;
  }

  const tableRows = courses.map((course, index) => ({
    '#': index + 1,
    score: course.fit_score.toFixed(1),
    course_id: course.course_id,
    title: truncate(course.title, 48),
    tier: course.tier ?? '',
    tier_score: course.tier_score,
    level: truncate(formatJsonList(course.level), 28),
    videos: course.videos,
    pdfs: course.pdfs,
    notes: course.notes,
    psets: course.psets,
    exams: course.exams
  }));

  const columns = [
    '#',
    'score',
    'course_id',
    'title',
    'tier',
    'tier_score',
    'level',
    'videos',
    'pdfs',
    'notes',
    'psets',
    'exams'
  ];

  console.log(`\n=== Course Shortlist (${courses.length} shown, sort: ${options.sort || 'score'}) ===\n`);
  printTable(tableRows, columns);
}

function isCandidate(row, options) {
  if (row.materials <= 0) return false;
  if (!options.includeHold && (row.status === 'hold' || row.tier === 3)) return false;
  if (options.topic && !matchesTopic(row, options.topic)) return false;
  if (options.department && !matchesDepartment(row, options.department)) return false;
  if (options.minVideos && row.videos < options.minVideos) return false;
  if (options.minPdfs && row.pdfs < options.minPdfs) return false;
  if (options.material && getMaterialCount(row, options.material) <= 0) return false;
  return true;
}

function normalizeCourseRow(row) {
  return {
    ...row,
    tier: row.tier === null ? null : Number(row.tier),
    tier_score: Number(row.tier_score || 0),
    materials: Number(row.materials || 0),
    videos: Number(row.videos || 0),
    pdfs: Number(row.pdfs || 0),
    notes: Number(row.notes || 0),
    psets: Number(row.psets || 0),
    exams: Number(row.exams || 0)
  };
}

function calculateFitScore(row) {
  const score = row.tier_score +
    Math.min(row.videos, 80) * 0.2 +
    Math.min(row.pdfs, 80) * 0.15 +
    Math.min(row.notes, 40) * 0.5 +
    Math.min(row.psets, 20) * 1.5 +
    Math.min(row.exams, 20) +
    calculateMaterialMix(row) * 2;

  return Math.round(score * 10) / 10;
}

function calculateMaterialMix(row) {
  return ['videos', 'pdfs', 'notes', 'psets', 'exams']
    .map(type => getMaterialCount(row, type))
    .filter(count => count > 0)
    .length;
}

function createCourseSorter(sort) {
  return (a, b) => {
    if (sort === 'title') {
      return a.title.localeCompare(b.title) || b.fit_score - a.fit_score;
    }

    const metric = sort === 'score' ? 'fit_score' : sort;
    return b[metric] - a[metric] ||
      b.material_mix - a.material_mix ||
      b.tier_score - a.tier_score ||
      a.title.localeCompare(b.title);
  };
}

function getMaterialCount(row, material) {
  if (material === 'videos') return row.videos;
  if (material === 'pdfs') return row.pdfs;
  if (material === 'notes') return row.notes;
  if (material === 'psets') return row.psets;
  if (material === 'exams') return row.exams;
  return 0;
}

function matchesTopic(row, topic) {
  const needle = topic.toLowerCase();
  const haystack = [
    row.title,
    row.topics,
    row.course_id
  ].filter(Boolean).join(' ').toLowerCase();

  return haystack.includes(needle);
}

function matchesDepartment(row, department) {
  const needle = String(department).trim().toLowerCase();
  const departments = parseJsonArray(row.department_numbers).map(value => String(value).toLowerCase());
  const coursePrefix = String(row.course_id || '').split('-')[0].toLowerCase();

  return departments.some(value => value === needle || value.startsWith(`${needle}.`)) ||
    coursePrefix === needle ||
    coursePrefix.startsWith(`${needle}.`);
}

function formatJsonList(value) {
  const values = parseJsonArray(value);
  return values.length > 0 ? values.join(', ') : '';
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.flat(Infinity).filter(Boolean) : [];
  } catch {
    return [String(value)];
  }
}

function printTable(rows, columns) {
  const widths = Object.fromEntries(columns.map(column => [
    column,
    Math.max(
      String(column).length,
      ...rows.map(row => String(row[column] ?? '').length)
    )
  ]));

  console.log(columns.map(column => pad(String(column), widths[column])).join('  '));
  console.log(columns.map(column => '-'.repeat(widths[column])).join('  '));

  for (const row of rows) {
    console.log(columns.map(column => pad(String(row[column] ?? ''), widths[column])).join('  '));
  }
}

function pad(value, width) {
  return value + ' '.repeat(Math.max(0, width - value.length));
}

function truncate(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

export default {
  getShortlistOptions,
  getShortlist,
  printShortlist
};
