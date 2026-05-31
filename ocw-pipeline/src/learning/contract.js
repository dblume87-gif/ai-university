import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../lib/cli.js';
import { DEFAULT_LEARNING_PATH_ID, DEFAULT_STATE_PATH } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, '../../library.db');
const DEFAULT_CONTRACT_ROOT = join(dirname(dirname(DEFAULT_STATE_PATH)), 'contracts');

const CONTRACT_SCHEMA = {
  stringFlags: [
    '--contract',
    '--goal',
    '--current-level',
    '--time-budget',
    '--target-outcome',
    '--style',
    '--language',
    '--preferred-materials',
    '--out',
    '--contract-id'
  ],
  booleanFlags: ['--help', '-h']
};

const CANDIDATE_SCHEMA = {
  stringFlags: ['--contract', '--goal', '--db', '--out'],
  intFlags: ['--limit'],
  booleanFlags: ['--help', '-h']
};

export function getLearnContractOptions(args) {
  const parsed = parseCliArgs(args, CONTRACT_SCHEMA);
  return {
    contractPath: parsed.getString('--contract', null),
    contractId: parsed.getString('--contract-id', null),
    goal: parsed.getString('--goal') || parsed.positional.join(' '),
    currentLevel: parsed.getString('--current-level', null),
    timeBudget: parsed.getString('--time-budget', null),
    targetOutcome: parsed.getString('--target-outcome', null),
    style: parsed.getString('--style', null),
    language: parsed.getString('--language', null),
    preferredMaterials: parsed.getList('--preferred-materials', null),
    outPath: parsed.getString('--out', null),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function getLearnCandidatesOptions(args) {
  const parsed = parseCliArgs(args, CANDIDATE_SCHEMA);
  return {
    contractPath: parsed.getString('--contract', null),
    goal: parsed.getString('--goal') || parsed.positional.join(' '),
    dbPath: parsed.getString('--db', DEFAULT_DB_PATH),
    outPath: parsed.getString('--out', null),
    limit: Math.min(parsed.getPositiveInt('--limit', 5), 5),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function normalizeLearningContract(input = {}) {
  const raw = loadContractInput(input);
  const goal = normalizeString(raw.goal || input.goal);
  const currentLevel = normalizeChoice(raw.current_level || raw.currentLevel || input.currentLevel, 'beginner');
  const targetOutcome = normalizeChoice(raw.target_outcome || raw.targetOutcome || input.targetOutcome, 'prototype');
  const style = normalizeChoice(raw.style || input.style, 'practical');
  const language = normalizeChoice(raw.language || input.language, 'de');
  const preferredMaterials = normalizeMaterials(raw.preferred_materials || raw.preferredMaterials || input.preferredMaterials);
  const timeBudget = normalizeString(raw.time_budget || raw.timeBudget || input.timeBudget);

  if (!goal || goal.split(/\s+/).filter(Boolean).length < 2 || tokenize(goal).length < 1) {
    throw new Error('Learning Contract ist zu vage: Bitte ein konkretes goal angeben.');
  }

  return {
    contract_id: raw.contract_id || input.contractId || createContractId(),
    goal,
    current_level: currentLevel,
    time_budget: timeBudget || null,
    target_outcome: targetOutcome,
    style,
    language,
    preferred_materials: preferredMaterials,
    defaults: {
      current_level: raw.current_level || raw.currentLevel || input.currentLevel ? null : 'beginner',
      target_outcome: raw.target_outcome || raw.targetOutcome || input.targetOutcome ? null : 'prototype',
      style: raw.style || input.style ? null : 'practical',
      language: raw.language || input.language ? null : 'de',
      preferred_materials: preferredMaterials.length > 0 ? null : []
    },
    field_usage: {
      goal: 'keyword_topic_title_description_signal',
      current_level: 'level_fit_signal',
      time_budget: 'metadata_for_planner',
      target_outcome: 'practical_output_signal',
      style: 'material_and_course_mix_signal',
      language: 'response_asset_language_metadata',
      preferred_materials: 'material_signal'
    },
    created_at: new Date().toISOString()
  };
}

export function saveLearningContract(contract, outPath = null) {
  const target = resolve(outPath || join(DEFAULT_CONTRACT_ROOT, `${contract.contract_id}.json`));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return target;
}

export function selectCourseCandidates(options = {}) {
  const contract = options.contract || normalizeLearningContract(options);
  const selectorTerms = normalizeSelectorTerms(options.selectorTerms || options.selector_terms);
  const dbPath = resolve(options.dbPath || DEFAULT_DB_PATH);
  const rows = readCandidateRows(dbPath);
  const candidates = rows
    .map(row => scoreCourse(contract, row, { selectorTerms }))
    .filter(candidate => candidate.score > 0 && candidate.thematic_fit.has_goal_match)
    .sort((left, right) => right.score - left.score || left.course_id.localeCompare(right.course_id))
    .slice(0, Math.min(options.limit || 5, 5));

  return {
    contract_id: contract.contract_id,
    generated_at: new Date().toISOString(),
    selector: 'deterministic_baseline_v1',
    limit: Math.min(options.limit || 5, 5),
    normalized_contract: contract,
    candidate_courses: candidates,
    no_candidates: candidates.length === 0
  };
}

export function saveCandidateSelection(selection, outPath = null) {
  const target = resolve(outPath || join(DEFAULT_CONTRACT_ROOT, `${selection.contract_id}.candidates.json`));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');
  return target;
}

export function loadContract(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

export function printLearningContractResult(result) {
  console.log('\n=== Learning Contract ===\n');
  console.log(`Contract: ${result.contract.contract_id}`);
  console.log(`Goal: ${result.contract.goal}`);
  console.log(`Path: ${result.path}`);
}

export function printCandidateSelection(result) {
  console.log('\n=== Course Candidates ===\n');
  console.log(`Contract: ${result.selection.contract_id}`);
  console.log(`Path: ${result.path}`);
  if (result.selection.no_candidates) {
    console.log('No candidates found.');
    return;
  }
  for (const candidate of result.selection.candidate_courses) {
    console.log(`${candidate.score.toFixed(1)}  ${candidate.course_id}  ${candidate.title}`);
    console.log(`  ${candidate.reason}`);
  }
}

function loadContractInput(input) {
  if (input.contractPath) return loadContract(input.contractPath);
  return input;
}

function readCandidateRows(dbPath) {
  if (!existsSync(dbPath)) throw new Error(`library.db nicht gefunden: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare(`
      SELECT
        c.course_id,
        c.title,
        c.source_url,
        c.level,
        c.topics,
        c.learning_resource_types,
        c.status,
        c.tier,
        c.tier_score,
        c.screening_reason,
        c.notebooklm_status,
        c.notebooklm_manifest_path,
        COUNT(m.id) AS material_count,
        SUM(CASE WHEN m.material_type = 'Lecture Videos' OR m.media_type IN ('youtube', 'video') THEN 1 ELSE 0 END) AS lecture_videos,
        SUM(CASE WHEN m.material_type IN ('Projects', 'Projects with Examples', 'Programming Assignments', 'Programming Assignments with Examples') THEN 1 ELSE 0 END) AS projects,
        SUM(CASE WHEN m.material_type IN ('Problem Sets', 'Problem Set Solutions') THEN 1 ELSE 0 END) AS problem_sets,
        SUM(CASE WHEN m.material_type IN ('Lecture Notes', 'Lecture Slides') OR m.media_type = 'pdf' THEN 1 ELSE 0 END) AS documents
      FROM courses c
      LEFT JOIN materials m ON m.course_id = c.course_id
      GROUP BY c.course_id
    `).all().map(normalizeCourseRow);
  } finally {
    db.close();
  }
}

function scoreCourse(contract, row, options = {}) {
  const fields = {
    goal: scoreGoal(contract, row, options),
    current_level: scoreLevel(contract, row),
    target_outcome: scoreTargetOutcome(contract, row),
    style: scoreStyle(contract, row),
    preferred_materials: scorePreferredMaterials(contract, row),
    language: {
      contribution: 0,
      effect: 'neutral',
      reason: `${contract.language} stored for downstream responses/assets`
    },
    time_budget: {
      contribution: 0,
      effect: 'neutral',
      reason: contract.time_budget ? 'stored for planner constraints' : 'default/no constraint for selector'
    },
    material_quality: scoreMaterialQuality(row),
    notebooklm: scoreNotebookLm(row)
  };
  const score = Object.values(fields).reduce((sum, field) => sum + field.contribution, 0);
  const positive = Object.entries(fields)
    .filter(([, value]) => value.contribution > 0)
    .map(([key, value]) => `${key}:${value.reason}`);
  const negative = Object.entries(fields)
    .filter(([, value]) => value.contribution < 0)
    .map(([key, value]) => `${key}:${value.reason}`);

  return {
    course_id: row.course_id,
    title: row.title,
    score: Math.round(score * 10) / 10,
    thematic_fit: {
      has_goal_match: passesGoalGate(fields.goal),
      matched_tokens: fields.goal.matched_tokens || [],
      gate: passesGoalGate(fields.goal) ? 'passed' : 'filtered'
    },
    reason: positive.slice(0, 4).join('; ') || 'weak baseline match',
    signals: {
      level: parseJsonArray(row.level),
      topics: parseJsonArray(row.topics).flat(Infinity).filter(Boolean),
      learning_resource_types: parseJsonArray(row.learning_resource_types),
      materials: {
        total: row.material_count,
        lecture_videos: row.lecture_videos,
        projects: row.projects,
        problem_sets: row.problem_sets,
        documents: row.documents
      },
      notebooklm_status: row.notebooklm_status || null
    },
    field_contributions: fields,
    negatives: negative
  };
}

function scoreGoal(contract, row, options = {}) {
  const terms = options.selectorTerms?.length > 0
    ? [...expandGoalTokens(contract.goal), ...options.selectorTerms]
    : expandGoalTokens(contract.goal);
  const haystackTokens = tokenize([
    row.course_id,
    row.title,
    row.topics,
    row.learning_resource_types
  ].join(' '));
  const haystackTokenSet = new Set(haystackTokens);
  const haystackText = ` ${haystackTokens.join(' ')} `;
  const matches = new Map();

  for (const term of terms) {
    const tokens = tokenize(term);
    if (tokens.length === 0) continue;

    if (tokens.length === 1) {
      const token = tokens[0];
      if (!haystackTokenSet.has(token)) continue;
      addGoalMatch(matches, token, tokenContribution(token));
      continue;
    }

    const phrase = tokens.join(' ');
    const phrasePresent = haystackText.includes(` ${phrase} `);
    const allTermsPresent = tokens.every(token => haystackTokenSet.has(token));
    if (phrasePresent || allTermsPresent) {
      addGoalMatch(matches, phrase, phrasePresent ? 30 : 22);
      continue;
    }

    for (const token of tokens) {
      if (!haystackTokenSet.has(token) || LOW_SIGNAL_SELECTOR_TOKENS.has(token)) continue;
      addGoalMatch(matches, token, tokenContribution(token));
    }
  }

  const uniqueHits = [...matches.keys()];
  const contribution = [...matches.values()].reduce((sum, value) => sum + value, 0);
  return {
    contribution,
    effect: contribution > 0 ? 'positive' : 'neutral',
    reason: contribution > 0 ? `matched ${uniqueHits.slice(0, 6).join(', ')}` : 'no keyword match',
    matched_tokens: uniqueHits
  };
}

function passesGoalGate(goalField) {
  return Number(goalField?.contribution || 0) >= 12;
}

function addGoalMatch(matches, label, contribution) {
  matches.set(label, Math.max(matches.get(label) || 0, contribution));
}

function tokenContribution(token) {
  if (LOW_SIGNAL_SELECTOR_TOKENS.has(token)) return 4;
  if (MEDIUM_SIGNAL_SELECTOR_TOKENS.has(token)) return 10;
  if (HIGH_SIGNAL_SELECTOR_TOKENS.has(token)) return 18;
  return 12;
}

function scoreLevel(contract, row) {
  const levelText = parseJsonArray(row.level).join(' ').toLowerCase();
  if (contract.current_level === 'beginner') {
    if (/undergraduate|intro|beginner/.test(levelText) || /introduction|intro/i.test(row.title)) {
      return { contribution: 14, effect: 'positive', reason: 'beginner-friendly level/title' };
    }
    if (/graduate|advanced/.test(levelText)) return { contribution: -8, effect: 'negative', reason: 'advanced level for beginner' };
  }
  return { contribution: 0, effect: 'neutral', reason: 'level not decisive' };
}

function scoreTargetOutcome(contract, row) {
  if (contract.target_outcome !== 'prototype') return { contribution: 0, effect: 'neutral', reason: 'target outcome stored' };
  const practicalCount = row.projects + row.problem_sets;
  return {
    contribution: Math.min(18, practicalCount * 4),
    effect: practicalCount > 0 ? 'positive' : 'neutral',
    reason: practicalCount > 0 ? `${practicalCount} project/problem-set materials` : 'no project/problem-set signal'
  };
}

function scoreStyle(contract, row) {
  if (contract.style === 'practical') {
    const count = row.projects + row.problem_sets + row.lecture_videos;
    return {
      contribution: Math.min(16, count * 2),
      effect: count > 0 ? 'positive' : 'neutral',
      reason: count > 0 ? 'practical material mix' : 'no practical material signal'
    };
  }
  if (contract.style === 'conceptual') {
    return { contribution: Math.min(12, row.documents * 1.5), effect: 'positive', reason: 'document/concept material signal' };
  }
  return { contribution: 0, effect: 'neutral', reason: 'style stored' };
}

function scorePreferredMaterials(contract, row) {
  let score = 0;
  const reasons = [];
  for (const material of contract.preferred_materials) {
    if (material === 'lecture videos' && row.lecture_videos > 0) {
      score += Math.min(10, row.lecture_videos * 2);
      reasons.push('lecture videos');
    }
    if (material === 'projects' && row.projects + row.problem_sets > 0) {
      score += Math.min(10, (row.projects + row.problem_sets) * 2);
      reasons.push('projects/problem sets');
    }
  }
  return {
    contribution: score,
    effect: score > 0 ? 'positive' : 'neutral',
    reason: reasons.length > 0 ? reasons.join(', ') : 'preferred materials not present'
  };
}

function scoreMaterialQuality(row) {
  const tierScore = Number(row.tier_score || 0);
  const materialScore = Math.min(12, row.material_count * 0.5);
  const tierPenalty = Number(row.tier) === 3 ? -12 : 0;
  return {
    contribution: tierScore * 0.5 + materialScore + tierPenalty,
    effect: tierPenalty < 0 ? 'negative' : 'positive',
    reason: `tier_score=${tierScore}, materials=${row.material_count}`
  };
}

const NOTEBOOKLM_READY_STATUSES = new Set(['ready_for_notebooklm', 'approved_for_notebooklm', 'uploaded_to_notebooklm', 'notebooklm_validated']);

function scoreNotebookLm(row) {
  const ready = NOTEBOOKLM_READY_STATUSES.has(row.notebooklm_status) || Boolean(row.notebooklm_manifest_path) || NOTEBOOKLM_READY_STATUSES.has(row.status);
  return {
    contribution: ready ? 12 : 0,
    effect: ready ? 'positive' : 'neutral',
    reason: ready ? 'NotebookLM-ready/uploaded signal' : 'no NotebookLM signal'
  };
}

function normalizeCourseRow(row) {
  return {
    ...row,
    tier: row.tier === null ? null : Number(row.tier),
    tier_score: Number(row.tier_score || 0),
    material_count: Number(row.material_count || 0),
    lecture_videos: Number(row.lecture_videos || 0),
    projects: Number(row.projects || 0),
    problem_sets: Number(row.problem_sets || 0),
    documents: Number(row.documents || 0)
  };
}

function expandGoalTokens(goal) {
  const tokens = tokenize(goal);
  const extra = [];
  if (tokens.some(token => ['ai', 'apps', 'app'].includes(token))) {
    extra.push('artificial', 'intelligence', 'python', 'programming', 'generative', 'prompt', 'foundation', 'prototype');
  }
  if (tokens.some(token => ['backprop', 'backpropagation'].includes(token))) {
    extra.push('neural', 'network', 'calculus', 'matrix', 'machine', 'learning', 'gradient');
  }
  return [...new Set([...tokens, ...extra])];
}

function normalizeSelectorTerms(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(item => normalizeString(item)).filter(Boolean))];
}

function normalizeMaterials(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(item => normalizeMaterialName(item)).filter(Boolean))];
}

function normalizeMaterialName(value) {
  const text = normalizeString(value).toLowerCase();
  if (!text) return null;
  if (text.includes('video')) return 'lecture videos';
  if (text.includes('project') || text.includes('assignment')) return 'projects';
  if (text.includes('problem')) return 'projects';
  return text;
}

function normalizeChoice(value, fallback) {
  const text = normalizeString(value).toLowerCase().replaceAll('_', '-');
  return text || fallback;
}

function normalizeString(value) {
  return String(value || '').trim();
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
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.flat(Infinity).filter(Boolean) : [];
  } catch {
    return [String(value)];
  }
}

function createContractId() {
  return `${DEFAULT_LEARNING_PATH_ID}-${randomUUID().slice(0, 8)}`;
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
  'fundamental',
  'fundamentals',
  'beginner',
  'beginners',
  'grundlagen',
  'kurs',
  'kurse'
]);

const HIGH_SIGNAL_SELECTOR_TOKENS = new Set([
  'strategy',
  'strategic',
  'competitive',
  'advantage',
  'diversification',
  'portfolio',
  'entrepreneurship',
  'innovation',
  'leadership',
  'organization',
  'organizations',
  'organizational'
]);

const MEDIUM_SIGNAL_SELECTOR_TOKENS = new Set([
  'growth'
]);

const LOW_SIGNAL_SELECTOR_TOKENS = new Set([
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
