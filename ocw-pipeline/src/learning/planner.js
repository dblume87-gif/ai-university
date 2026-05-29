import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { parseCliArgs } from '../lib/cli.js';
import { loadContract } from './contract.js';
import { loadMaterialScreening } from './material-screening.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_ROOT = join(__dirname, '../../output/learning-paths');

const PLAN_SCHEMA = {
  stringFlags: ['--contract', '--materials', '--out'],
  intFlags: ['--max-units'],
  booleanFlags: ['--help', '-h']
};

export function getLearnPlanOptions(args) {
  const parsed = parseCliArgs(args, PLAN_SCHEMA);
  return {
    contractPath: parsed.getString('--contract', null),
    materialsPath: parsed.getString('--materials', parsed.positional[0]),
    outPath: parsed.getString('--out', null),
    maxUnits: clamp(parsed.getPositiveInt('--max-units', 12), 1, 12),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function buildLearningPathPlan(options = {}) {
  const screening = options.screening || loadMaterialScreening(options.materialsPath);
  const contract = options.contract ||
    screening.normalized_contract ||
    (options.contractPath ? loadContract(options.contractPath) : null) ||
    screening.course_material_overviews?.[0]?.recommendation_basis?.contract ||
    {};
  const units = selectPlanUnits({ screening, contract, maxUnits: options.maxUnits || 12 });
  if (units.length === 0) throw new Error('Learning Path Planner: keine Units mit Sources oder markierbaren Gaps gefunden.');

  const pathId = options.pathId || buildPathId(screening.contract_id || contract.contract_id || 'path');
  const sources = collectPlanSources(units);
  return {
    path_id: pathId,
    contract_id: screening.contract_id || contract.contract_id || null,
    generated_at: new Date().toISOString(),
    language: contract.language || 'de',
    title: buildTitle(contract),
    status: 'planned',
    selected_courses: screening.candidate_courses || [],
    units,
    sources,
    gaps: screening.gaps || [],
    source_limits: {
      required_source_count: sources.filter(source => source.required).length,
      optional_source_count: sources.filter(source => !source.required).length,
      max_sources_for_notebook: 60
    },
    markdown: renderLearningPathMarkdown({ contract, units, screening })
  };
}

export function saveLearningPathPlan(plan, outPath = null) {
  const base = outPath
    ? resolve(outPath)
    : resolve(join(DEFAULT_OUTPUT_ROOT, plan.path_id, 'learning-path.json'));
  mkdirSync(dirname(base), { recursive: true });
  writeFileSync(base, `${JSON.stringify(withoutMarkdown(plan), null, 2)}\n`, 'utf8');
  const markdownPath = base.replace(/\.json$/i, '.md');
  writeFileSync(markdownPath, plan.markdown, 'utf8');
  return { jsonPath: base, markdownPath };
}

export function loadLearningPathPlan(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

export function printLearningPathPlanResult(result) {
  console.log('\n=== Learning Path Plan ===\n');
  console.log(`Path: ${result.plan.path_id}`);
  console.log(`Units: ${result.plan.units.length}`);
  console.log(`JSON: ${result.paths.jsonPath}`);
  console.log(`Markdown: ${result.paths.markdownPath}`);
}

function selectPlanUnits({ screening, contract, maxUnits }) {
  const preferred = new Set(contract.preferred_materials || []);
  const unitCandidates = [];
  for (const overview of screening.course_material_overviews || []) {
    const usableByMaterialId = new Map((overview.usable_sources || []).map(source => [Number(source.material_id), source]));
    for (const unit of overview.units || []) {
      const sources = (unit.sources || [])
        .map(source => usableByMaterialId.get(Number(source.id)))
        .filter(Boolean);
      const required = sources.filter(source => source.required_hint || isPreferredSource(source, preferred)).slice(0, 4);
      const optional = sources.filter(source => !required.includes(source)).slice(0, 4);
      const gaps = [];
      if (sources.length === 0) gaps.push({ code: 'unit_without_sources', message: 'No usable sources mapped to unit.' });
      unitCandidates.push({
        course_id: overview.course_id,
        unit_number: unit.unit_number,
        source_count: sources.length,
        practical_score: sources.filter(source => /problem|assignment|project/i.test(source.material_type || '')).length,
        data: {
          unit_id: `${overview.course_id}:u${String(unit.unit_number).padStart(2, '0')}`,
          course_id: overview.course_id,
          title: unit.title,
          learning_goal: buildLearningGoal(unit, contract),
          difficulty: inferDifficulty(unit, contract),
          estimated_effort: estimateEffort(sources),
          source_ids: sources.map(source => source.source_id),
          required_source_ids: required.map(source => source.source_id),
          optional_source_ids: optional.map(source => source.source_id),
          sources: sources.map(source => ({
            ...source,
            required: required.includes(source)
          })),
          gaps,
          reason: buildUnitReason(unit, overview, contract)
        }
      });
    }
  }

  return unitCandidates
    .sort((left, right) => unitSortScore(right, contract) - unitSortScore(left, contract) || left.unit_number - right.unit_number)
    .slice(0, maxUnits)
    .sort((left, right) => left.unit_number - right.unit_number)
    .map((candidate, index) => ({
      ...candidate.data,
      order: index + 1
    }));
}

function unitSortScore(candidate, contract) {
  let score = candidate.source_count * 2 + candidate.practical_score * 5;
  if (contract.current_level === 'beginner' && candidate.unit_number <= 3) score += 10;
  if (contract.target_outcome === 'prototype' || contract.style === 'practical') score += candidate.practical_score * 3;
  return score;
}

function collectPlanSources(units) {
  const seen = new Map();
  for (const unit of units) {
    for (const source of unit.sources || []) {
      const existing = seen.get(source.source_id);
      seen.set(source.source_id, {
        ...source,
        unit_ids: [...new Set([...(existing?.unit_ids || []), unit.unit_id])],
        required: Boolean(existing?.required || source.required)
      });
    }
  }
  return [...seen.values()];
}

function renderLearningPathMarkdown({ contract, units, screening }) {
  const lines = [
    `# ${buildTitle(contract)}`,
    '',
    `Contract: \`${screening.contract_id || contract.contract_id || ''}\``,
    `Language: ${contract.language || 'de'}`,
    '',
    '## Units',
    ''
  ];
  for (const unit of units) {
    lines.push(`### ${unit.order}. ${unit.title}`);
    lines.push('');
    lines.push(`- Goal: ${unit.learning_goal}`);
    lines.push(`- Difficulty: ${unit.difficulty}`);
    lines.push(`- Effort: ${unit.estimated_effort}`);
    lines.push(`- Required sources: ${unit.required_source_ids.join(', ') || 'none'}`);
    lines.push(`- Optional sources: ${unit.optional_source_ids.join(', ') || 'none'}`);
    if (unit.gaps.length > 0) lines.push(`- Gaps: ${unit.gaps.map(gap => gap.code).join(', ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildTitle(contract) {
  return `Learning Path: ${contract.goal || 'Personal Plan'}`;
}

function buildLearningGoal(unit, contract) {
  return contract.language === 'de'
    ? `Verstehe ${unit.title} im Kontext von "${contract.goal || 'deinem Lernziel'}".`
    : `Understand ${unit.title} in the context of "${contract.goal || 'your goal'}".`;
}

function inferDifficulty(unit, contract) {
  if (contract.current_level === 'beginner' && Number(unit.unit_number) <= 3) return 'easy';
  if (Number(unit.unit_number) >= 9) return 'advanced';
  return 'standard';
}

function estimateEffort(sources) {
  if (sources.length <= 2) return '1-2h';
  if (sources.length <= 5) return '2-4h';
  return '4-6h';
}

function buildUnitReason(unit, overview, contract) {
  const bits = [`from ${overview.course_id}`];
  if (contract.style === 'practical') bits.push('practical baseline prioritization');
  if (contract.current_level === 'beginner') bits.push('ordered for beginner progression');
  return bits.join('; ');
}

function isPreferredSource(source, preferred) {
  if (preferred.has('lecture videos') && /video|youtube/i.test(`${source.material_type} ${source.media_type}`)) return true;
  if (preferred.has('projects') && /project|assignment|problem/i.test(source.material_type || '')) return true;
  return false;
}

function withoutMarkdown(plan) {
  const { markdown, ...rest } = plan;
  return rest;
}

function buildPathId(contractId) {
  return String(contractId || 'path').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
