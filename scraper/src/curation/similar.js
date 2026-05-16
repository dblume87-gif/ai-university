import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../library.db');

const DEFAULT_LIMIT = 5;
const BROAD_TOPICS = new Set([
  'business',
  'energy',
  'engineering',
  'humanities',
  'mathematics',
  'science',
  'social science'
]);
const TITLE_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'for',
  'in',
  'introduction',
  'of',
  'the',
  'to',
  'using',
  'with'
]);

export function getSimilarOptions(args = []) {
  return {
    courseId: getSimilarCourseArg(args),
    limit: getPositiveIntegerOption(args, '--limit', DEFAULT_LIMIT),
    includeHold: args.includes('--include-hold')
  };
}

export function getSimilarCourses(options = {}) {
  if (!options.courseId) {
    throw new Error('Missing course id. Usage: node src/scrape.js similar <course-id> [--limit 5] [--include-hold]');
  }

  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  let rows;

  try {
    rows = db.prepare(`
      SELECT
        course_id,
        title,
        departments,
        department_numbers,
        topics,
        status,
        tier,
        tier_score,
        source_url
      FROM courses
    `).all();
  } finally {
    db.close();
  }

  const seed = rows.find(row => row.course_id === options.courseId);
  if (!seed) {
    throw new Error(`Course not found: ${options.courseId}`);
  }

  const seedSignals = getCourseSignals(seed);
  const courses = rows
    .filter(row => row.course_id !== seed.course_id)
    .filter(row => options.includeHold || (row.status !== 'hold' && Number(row.tier) !== 3))
    .map(row => {
      const signals = getCourseSignals(row);
      const similarity = calculateSimilarity(seedSignals, signals);
      return {
        ...row,
        similarity,
        shared_topics: intersection(seedSignals.topics, signals.topics),
        shared_departments: intersection(seedSignals.departments, signals.departments),
        shared_title_words: intersection(seedSignals.titleWords, signals.titleWords)
      };
    })
    .filter(row => row.similarity > 0)
    .sort((a, b) =>
      b.similarity - a.similarity ||
      b.shared_topics.length - a.shared_topics.length ||
      b.shared_departments.length - a.shared_departments.length ||
      Number(b.tier_score || 0) - Number(a.tier_score || 0) ||
      a.title.localeCompare(b.title)
    )
    .slice(0, options.limit || DEFAULT_LIMIT);

  return { seed, courses };
}

export function printSimilarCourses(seed, courses, options = {}) {
  if (courses.length === 0) {
    console.log(`No similar courses found for ${seed.course_id}.`);
    return;
  }

  const rows = courses.map((course, index) => ({
    '#': index + 1,
    similarity: course.similarity,
    course_id: course.course_id,
    title: truncate(course.title, 48),
    tier: course.tier ?? '',
    tier_score: course.tier_score ?? '',
    topics: truncate(course.shared_topics.join(', '), 34),
    departments: course.shared_departments.join(', '),
    title_words: truncate(course.shared_title_words.join(', '), 24)
  }));

  const columns = [
    '#',
    'similarity',
    'course_id',
    'title',
    'tier',
    'tier_score',
    'topics',
    'departments',
    'title_words'
  ];

  console.log(`\n=== Similar Courses for ${seed.course_id} (${courses.length} shown) ===`);
  console.log(`${seed.title}\n`);
  printTable(rows, columns);
}

function calculateSimilarity(seed, candidate) {
  const topicScore = intersection(seed.topics, candidate.topics).length * 50;
  const departmentScore = intersection(seed.departments, candidate.departments).length * 20;
  const titleScore = intersection(seed.titleWords, candidate.titleWords).length * 8;

  return topicScore + departmentScore + titleScore;
}

function getCourseSignals(row) {
  return {
    topics: getTopicSignals(row.topics),
    departments: getDepartmentSignals(row),
    titleWords: getTitleWords(row.title)
  };
}

function getDepartmentSignals(row) {
  const numbers = normalizeSignals(parseJsonArray(row.department_numbers));
  if (numbers.length > 0) return numbers;
  return normalizeSignals(parseJsonArray(row.departments));
}

function getTitleWords(title) {
  return normalizeSignals(String(title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(word => word.length >= 3 && !TITLE_STOPWORDS.has(word)));
}

function getTopicSignals(topicsJson) {
  const parsed = parseJsonValue(topicsJson);
  const topicPaths = Array.isArray(parsed) ? parsed : [];
  const signals = [];

  for (const path of topicPaths) {
    const parts = Array.isArray(path) ? path : [path];
    const normalizedParts = normalizeSignals(parts);
    signals.push(...normalizedParts.filter(part => !BROAD_TOPICS.has(part)));

    if (normalizedParts.length >= 2) {
      signals.push(normalizedParts.slice(-2).join(' > '));
    }
  }

  return normalizeSignals(signals);
}

function normalizeSignals(values) {
  return [...new Set(values
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean))];
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter(value => rightSet.has(value));
}

function parseJsonArray(value) {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed) ? parsed.flat(Infinity).filter(Boolean) : [];
}

function parseJsonValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    return JSON.parse(value);
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

function getSimilarCourseArg(args) {
  for (let i = 0; i < args.length; i++) {
    const value = args[i];
    if (value === '--limit') {
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

function getPositiveIntegerOption(args, name, fallback) {
  const value = Number.parseInt(getOptionValue(args, name), 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export default {
  getSimilarOptions,
  getSimilarCourses,
  printSimilarCourses
};
