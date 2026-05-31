import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import {
  normalizeLearningContract,
  selectCourseCandidates
} from '../../../ocw-pipeline/src/learning/contract.js';

const requireFromPipeline = createRequire(new URL('../../../ocw-pipeline/package.json', import.meta.url));
const Database = requireFromPipeline('better-sqlite3');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, '../../data/library.db');
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

const WEAK_SIGNAL_TOKENS = new Set([
  'analysis',
  'advanced',
  'based',
  'business',
  'management',
  'matrix',
  'model',
  'models',
  'value',
  'chain',
  'industry',
  'market',
  'entry',
  'decision',
  'making',
  'implementation',
  'formulation',
  'development',
  'corporate',
  'resource',
  'view'
]);

export function searchCourses(input = {}) {
  const query = normalizeString(input.query);
  if (!query) throw new Error('searchCourses requires input.query');

  const dbPath = resolve(input.dbPath || DEFAULT_DB_PATH);
  if (!existsSync(dbPath)) throw new Error(`library.db not found: ${dbPath}`);

  const limit = clampLimit(input.limit);
  const contract = normalizeLearningContract({
    goal: query,
    currentLevel: input.level || input.currentLevel || 'beginner',
    language: input.language || 'de',
    targetOutcome: input.targetOutcome || 'prototype',
    style: input.style || 'practical',
    preferredMaterials: input.preferredMaterials || []
  });

  const selection = selectCourseCandidates({
    dbPath,
    contract,
    limit: Math.min(limit, DEFAULT_LIMIT)
  });

  const primary = selection.candidate_courses.map(course => evidenceFromCandidate(course, {
    query,
    candidateSource: 'selectCourseCandidates'
  }));

  const supplemental = findWeakSignalCourses({
    dbPath,
    query,
    excludeIds: new Set(primary.map(course => course.course_id)),
    limit: Math.max(0, limit - primary.length)
  });

  return {
    query,
    normalized_contract: {
      goal: contract.goal,
      current_level: contract.current_level,
      target_outcome: contract.target_outcome,
      style: contract.style,
      language: contract.language
    },
    data_basis: 'mvp/data/library.db via ocw-pipeline selectCourseCandidates; title, topics, and material metadata counts',
    courses: [...primary, ...supplemental],
    no_candidates: primary.length === 0 && supplemental.length === 0
  };
}

function evidenceFromCandidate(candidate, { query, candidateSource }) {
  const matchedTokens = candidate.thematic_fit?.matched_tokens || [];
  const weakTokens = matchedTokens.filter(token => isWeakSignal(token));
  return {
    course_id: candidate.course_id,
    title: candidate.title,
    topics: candidate.signals?.topics || [],
    material_evidence: {
      source: 'library.db metadata counts; not material-screened',
      from_metadata_unverified: true,
      total: numberOrZero(candidate.signals?.materials?.total),
      breakdown: {
        lecture_videos: numberOrZero(candidate.signals?.materials?.lecture_videos),
        projects: numberOrZero(candidate.signals?.materials?.projects),
        problem_sets: numberOrZero(candidate.signals?.materials?.problem_sets),
        documents: numberOrZero(candidate.signals?.materials?.documents)
      }
    },
    fit_evidence: {
      score: numberOrZero(candidate.score),
      matched_tokens: matchedTokens,
      weak_signals: {
        matched_tokens: weakTokens,
        note: 'generic/low-signal matches; agent should not treat these as decisive'
      },
      reason: candidate.reason || 'candidate selected by deterministic evidence scorer',
      negatives: candidate.negatives || [],
      query,
      candidate_source: candidateSource
    },
    source: 'library.db / selectCourseCandidates'
  };
}

function findWeakSignalCourses({ dbPath, query, excludeIds, limit }) {
  if (limit <= 0) return [];

  const weakQueryTokens = tokenize(query).filter(token => WEAK_SIGNAL_TOKENS.has(token));
  if (weakQueryTokens.length === 0) return [];

  const rows = readCourseRows(dbPath);
  return rows
    .map(row => {
      const haystackTokens = new Set(tokenize(`${row.title} ${row.topics}`));
      const weakHits = weakQueryTokens.filter(token => haystackTokens.has(token));
      return { row, weakHits };
    })
    .filter(item => item.weakHits.length > 0 && !excludeIds.has(item.row.course_id))
    .sort((left, right) => {
      const scoreDelta = right.weakHits.length - left.weakHits.length;
      if (scoreDelta !== 0) return scoreDelta;
      return left.row.title.localeCompare(right.row.title);
    })
    .slice(0, limit)
    .map(item => evidenceFromWeakRow(item.row, item.weakHits, query));
}

function evidenceFromWeakRow(row, weakHits, query) {
  return {
    course_id: row.course_id,
    title: row.title,
    topics: parseJsonArray(row.topics),
    material_evidence: {
      source: 'library.db metadata counts; not material-screened',
      from_metadata_unverified: true,
      total: numberOrZero(row.material_count),
      breakdown: {
        lecture_videos: numberOrZero(row.lecture_videos),
        projects: numberOrZero(row.projects),
        problem_sets: numberOrZero(row.problem_sets),
        documents: numberOrZero(row.documents)
      }
    },
    fit_evidence: {
      score: 0,
      matched_tokens: weakHits,
      weak_signals: {
        matched_tokens: weakHits,
        note: 'weak-signal supplement; included for agent judgment, not as a recommendation'
      },
      reason: `weak generic match only: ${weakHits.join(', ')}`,
      negatives: ['not selected by selectCourseCandidates goal gate'],
      query,
      candidate_source: 'weak_signal_supplement'
    },
    source: 'library.db / weak signal supplement'
  };
}

function readCourseRows(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`
      SELECT
        c.course_id,
        c.title,
        c.topics,
        COUNT(m.id) AS material_count,
        SUM(CASE WHEN m.material_type = 'Lecture Videos' OR m.media_type IN ('youtube', 'video') THEN 1 ELSE 0 END) AS lecture_videos,
        SUM(CASE WHEN m.material_type IN ('Projects', 'Projects with Examples', 'Programming Assignments', 'Programming Assignments with Examples') THEN 1 ELSE 0 END) AS projects,
        SUM(CASE WHEN m.material_type IN ('Problem Sets', 'Problem Set Solutions') THEN 1 ELSE 0 END) AS problem_sets,
        SUM(CASE WHEN m.material_type IN ('Lecture Notes', 'Lecture Slides') OR m.media_type = 'pdf' THEN 1 ELSE 0 END) AS documents
      FROM courses c
      LEFT JOIN materials m ON m.course_id = c.course_id
      GROUP BY c.course_id
    `).all();
  } finally {
    db.close();
  }
}

function clampLimit(value) {
  const number = Number(value || DEFAULT_LIMIT);
  if (!Number.isFinite(number) || number < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(number), MAX_LIMIT);
}

function isWeakSignal(token) {
  const parts = tokenize(token);
  return parts.length > 0 && parts.every(part => WEAK_SIGNAL_TOKENS.has(part));
}

function tokenize(value) {
  return normalizeString(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2 && !STOPWORDS.has(token));
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flat(Infinity).filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.flat(Infinity).filter(Boolean) : [];
  } catch {
    return [String(value)];
  }
}

function normalizeString(value) {
  return String(value || '').trim();
}

function numberOrZero(value) {
  return Number(value || 0);
}

const STOPWORDS = new Set([
  'ich',
  'will',
  'lernen',
  'verstehen',
  'bauen',
  'und',
  'oder',
  'the',
  'and',
  'for',
  'to',
  'mit',
  'course',
  'courses',
  'kurs',
  'kurse'
]);

