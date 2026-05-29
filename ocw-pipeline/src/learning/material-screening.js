import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../lib/cli.js';
import { loadContract } from './contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(__dirname, '../../library.db');
const DEFAULT_OUTPUT_ROOT = join(__dirname, '../../output/learning-paths');

const SCREEN_MATERIALS_SCHEMA = {
  stringFlags: ['--candidates', '--contract', '--db', '--out'],
  intFlags: ['--top'],
  booleanFlags: ['--help', '-h']
};

export function getScreenMaterialsOptions(args) {
  const parsed = parseCliArgs(args, SCREEN_MATERIALS_SCHEMA);
  return {
    candidatesPath: parsed.getString('--candidates', parsed.positional[0]),
    contractPath: parsed.getString('--contract', null),
    dbPath: parsed.getString('--db', DEFAULT_DB_PATH),
    outPath: parsed.getString('--out', null),
    top: Math.min(parsed.getPositiveInt('--top', 5), 5),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function screenCandidateMaterials(options = {}) {
  const candidateSelection = options.candidateSelection || loadJson(options.candidatesPath);
  const contract = options.contract ||
    candidateSelection.normalized_contract ||
    (options.contractPath ? loadContract(options.contractPath) : null);
  const candidateCourses = (candidateSelection.candidate_courses || []).slice(0, Math.min(options.top || 5, 5));
  if (candidateCourses.length === 0) throw new Error('Keine Candidate Course IDs fuer Material-Screening gefunden.');

  const dbPath = resolve(options.dbPath || DEFAULT_DB_PATH);
  const rowsByCourse = readMaterialsForCourses(dbPath, candidateCourses.map(course => course.course_id));
  const courseMaterialOverviews = candidateCourses.map(candidate => buildCourseOverview({
    candidate,
    materialRows: rowsByCourse.get(candidate.course_id) || [],
    contract,
    unitsRoot: options.unitsRoot
  }));
  const usableSources = courseMaterialOverviews.flatMap(overview => overview.usable_sources);
  const gaps = courseMaterialOverviews.flatMap(overview => overview.gaps);

  return {
    contract_id: candidateSelection.contract_id || contract?.contract_id || null,
    generated_at: new Date().toISOString(),
    screening_mode: 'hybrid_cached_live_baseline',
    candidate_courses: candidateCourses.map(course => ({
      course_id: course.course_id,
      title: course.title,
      score: course.score
    })),
    course_material_overviews: courseMaterialOverviews,
    usable_sources: usableSources,
    gaps,
    recommendation_basis: buildRecommendationBasis(courseMaterialOverviews)
  };
}

export function saveMaterialScreening(screening, outPath = null) {
  const target = resolve(outPath || join(DEFAULT_OUTPUT_ROOT, screening.contract_id || 'default', 'material-screening.json'));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(screening, null, 2)}\n`, 'utf8');
  return target;
}

export function loadMaterialScreening(path) {
  return loadJson(path);
}

export function printMaterialScreeningResult(result) {
  console.log('\n=== Material Screening ===\n');
  console.log(`Contract: ${result.screening.contract_id || '(none)'}`);
  console.log(`Courses: ${result.screening.course_material_overviews.length}`);
  console.log(`Usable sources: ${result.screening.usable_sources.length}`);
  console.log(`Gaps: ${result.screening.gaps.length}`);
  console.log(`Path: ${result.path}`);
}

function buildCourseOverview({ candidate, materialRows, contract, unitsRoot }) {
  const units = loadCourseUnits(candidate.course_id, unitsRoot);
  const usableSources = materialRows
    .map(row => normalizeMaterialSource(candidate.course_id, row))
    .filter(source => source.usable);
  const gaps = [];
  if (!units) gaps.push(gap(candidate.course_id, 'missing_course_units', 'course_units.json missing; export units before planning high-quality path'));
  if (usableSources.length === 0) gaps.push(gap(candidate.course_id, 'no_usable_sources', 'no NotebookLM-usable source_url/local_path materials found'));
  if (materialRows.length === 0) gaps.push(gap(candidate.course_id, 'no_material_rows', 'library.db has no materials for candidate'));

  return {
    course_id: candidate.course_id,
    title: candidate.title,
    candidate_score: candidate.score,
    cache_status: units ? 'cached_units_available' : 'needs_unit_export',
    material_counts: countMaterials(materialRows),
    unit_count: units?.units?.length || 0,
    usable_sources: usableSources,
    gaps,
    recommendation_basis: {
      contract_goal: contract?.goal || null,
      candidate_reason: candidate.reason || null,
      preferred_materials: contract?.preferred_materials || []
    },
    units: units?.units || []
  };
}

function readMaterialsForCourses(dbPath, courseIds) {
  if (!existsSync(dbPath)) throw new Error(`library.db nicht gefunden: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare(`
      SELECT
        id,
        course_id,
        title,
        material_type,
        media_type,
        source_url,
        local_path,
        resource_path,
        metadata_json
      FROM materials
      WHERE course_id = ?
      ORDER BY id
    `);
    const map = new Map();
    for (const courseId of courseIds) map.set(courseId, rows.all(courseId));
    return map;
  } finally {
    db.close();
  }
}

function normalizeMaterialSource(courseId, row) {
  const uploadContent = row.source_url || row.local_path || null;
  const usable = Boolean(uploadContent) && isNotebookLmUsable(row);
  return {
    source_id: `${courseId}:m${row.id}`,
    material_id: row.id,
    course_id: courseId,
    title: row.title || row.resource_path || `Material ${row.id}`,
    material_type: row.material_type || row.type || null,
    media_type: row.media_type || null,
    source_url: row.source_url || null,
    local_path: row.local_path || null,
    upload_content: uploadContent,
    required_hint: isRequiredHint(row),
    usable
  };
}

function isNotebookLmUsable(row) {
  const mediaType = String(row.media_type || '').toLowerCase();
  const value = String(row.source_url || row.local_path || '').toLowerCase();
  if (['youtube', 'video', 'pdf', 'markdown', 'text', 'txt', 'docx', 'pptx', 'xlsx', 'csv', 'tsv'].includes(mediaType)) return true;
  return /\.(pdf|md|txt|docx|pptx|xlsx|csv|tsv)(\?|$)/.test(value) || value.includes('youtube.com') || value.includes('youtu.be');
}

function isRequiredHint(row) {
  const type = String(row.material_type || '').toLowerCase();
  return type.includes('lecture') || type.includes('problem') || type.includes('assignment') || type.includes('project');
}

function countMaterials(rows) {
  return rows.reduce((counts, row) => {
    counts.total += 1;
    const key = row.material_type || row.media_type || 'unknown';
    counts.by_type[key] = (counts.by_type[key] || 0) + 1;
    if (isNotebookLmUsable(row)) counts.usable += 1;
    return counts;
  }, { total: 0, usable: 0, by_type: {} });
}

function loadCourseUnits(courseId, unitsRoot = null) {
  const path = unitsRoot
    ? join(resolve(unitsRoot), courseId, 'course_units.json')
    : join(__dirname, '../../output/notebooklm', courseId, 'course_units.json');
  if (!existsSync(path)) return null;
  return loadJson(path);
}

function buildRecommendationBasis(overviews) {
  return overviews.map(overview => ({
    course_id: overview.course_id,
    cache_status: overview.cache_status,
    usable_source_count: overview.usable_sources.length,
    gap_count: overview.gaps.length
  }));
}

function gap(courseId, code, message) {
  return { course_id: courseId, code, message };
}

function loadJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}
