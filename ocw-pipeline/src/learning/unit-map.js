import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { parseCliArgs } from '../lib/cli.js';
import {
  DEFAULT_COURSE_ID,
  DEFAULT_COURSE_UNITS_PATH,
  DEFAULT_LEARNING_PATH_ID,
  DEFAULT_NOTEBOOK_ID,
  DEFAULT_SOURCE_LIST_PATH,
  DEFAULT_UNIT_MAP_PATH
} from './store.js';

const UNIT_MAP_SCHEMA = {
  stringFlags: ['--course-units', '--source-list', '--out', '--path-id', '--course-id', '--notebook-id'],
  booleanFlags: ['--help', '-h']
};

export function getLearnUnitMapOptions(args) {
  const parsed = parseCliArgs(args, UNIT_MAP_SCHEMA);
  return {
    courseUnitsPath: parsed.getString('--course-units', DEFAULT_COURSE_UNITS_PATH),
    sourceListPath: parsed.getString('--source-list', DEFAULT_SOURCE_LIST_PATH),
    outPath: parsed.getString('--out', DEFAULT_UNIT_MAP_PATH),
    pathId: parsed.getString('--path-id', DEFAULT_LEARNING_PATH_ID),
    courseId: parsed.getString('--course-id', DEFAULT_COURSE_ID),
    notebookId: parsed.getString('--notebook-id', DEFAULT_NOTEBOOK_ID),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function buildAndSaveUnitSourceMap(options = {}) {
  const unitMap = buildUnitSourceMap({
    courseUnits: readJson(resolve(options.courseUnitsPath || DEFAULT_COURSE_UNITS_PATH)),
    sourceList: readJson(resolve(options.sourceListPath || DEFAULT_SOURCE_LIST_PATH)),
    pathId: options.pathId,
    courseId: options.courseId,
    notebookId: options.notebookId
  });
  const outPath = resolve(options.outPath || DEFAULT_UNIT_MAP_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(unitMap, null, 2)}\n`);
  return { unitMap, outPath };
}

export function buildUnitSourceMap({ courseUnits, sourceList, pathId, courseId, notebookId }) {
  const sources = getReadySources(sourceList);
  const sourcesByUnit = new Map();
  const unmatchedSources = [];

  for (const source of sources) {
    const unitNumber = inferLectureNumber(source.title);
    if (!unitNumber) {
      unmatchedSources.push(normalizeNotebookSource(source));
      continue;
    }
    if (!sourcesByUnit.has(unitNumber)) sourcesByUnit.set(unitNumber, []);
    sourcesByUnit.get(unitNumber).push({
      ...normalizeNotebookSource(source),
      match: getSourceMatchKind(source.title)
    });
  }

  const units = (courseUnits.units || []).map(unit => {
    const unitNumber = Number(unit.unit_number);
    const matchedSources = sourcesByUnit.get(unitNumber) || [];
    const warnings = [];
    if (matchedSources.length === 0) warnings.push('no_ready_notebook_sources');

    return {
      unit_id: buildUnitId(courseId || courseUnits.course?.course_id, unitNumber),
      unit_number: unitNumber,
      title: unit.title,
      notebook_source_ids: matchedSources.map(source => source.id),
      matched_sources: matchedSources,
      warnings
    };
  });

  return {
    path_id: pathId || DEFAULT_LEARNING_PATH_ID,
    course_id: courseId || courseUnits.course?.course_id || DEFAULT_COURSE_ID,
    notebook_id: notebookId || sourceList.notebook_id || courseUnits.course?.notebooklm_notebook_id || DEFAULT_NOTEBOOK_ID,
    generated_at: new Date().toISOString(),
    units,
    unmatched_sources: unmatchedSources,
    summary: {
      unit_count: units.length,
      mapped_units: units.filter(unit => unit.notebook_source_ids.length > 0).length,
      ready_source_count: sources.length,
      unmatched_source_count: unmatchedSources.length
    }
  };
}

export function resolveUnitSourceIds({ unit, unitMapPath = DEFAULT_UNIT_MAP_PATH }) {
  if (!unit) return null;
  const unitMap = readJson(resolve(unitMapPath));
  const normalizedUnit = normalizeUnitInput(unit);
  const match = unitMap.units.find(candidate =>
    String(candidate.unit_number) === normalizedUnit ||
    candidate.unit_id === normalizedUnit
  );

  if (!match) {
    const available = unitMap.units.map(candidate => candidate.unit_number).join(', ');
    throw new Error(`Unbekannte Unit "${unit}". Verfuegbare Units: ${available}`);
  }

  if (!Array.isArray(match.notebook_source_ids) || match.notebook_source_ids.length === 0) {
    throw new Error(`Unit ${match.unit_number} hat keine gemappten NotebookLM ready Sources.`);
  }

  return {
    unitMap,
    unit: match,
    sourceIds: match.notebook_source_ids
  };
}

export function inferLectureNumber(value) {
  const text = String(value || '');
  const numberedTitle = text.match(/^\s*(\d{1,2})\s*[.)-]\s+/);
  if (numberedTitle) return Number.parseInt(numberedTitle[1], 10);

  const lecToken = text.match(/(?:^|[^A-Za-z])Lec(?:ture)?[_\-\s]?0*(\d{1,2})\b/i);
  if (lecToken) return Number.parseInt(lecToken[1], 10);

  const lectureToken = text.match(/\bLecture\s+0*(\d{1,2})\b/i);
  if (lectureToken) return Number.parseInt(lectureToken[1], 10);

  return null;
}

export function printUnitSourceMapResult(result) {
  const { unitMap, outPath } = result;
  console.log('\n=== Learning Unit Source Map ===\n');
  console.log(`Map: ${outPath}`);
  console.log(`Notebook: ${unitMap.notebook_id}`);
  console.log(`Units: ${unitMap.summary.mapped_units}/${unitMap.summary.unit_count} mapped`);
  console.log(`Ready Sources: ${unitMap.summary.ready_source_count}`);
  if (unitMap.summary.unmatched_source_count > 0) {
    console.log(`Unmatched Sources: ${unitMap.summary.unmatched_source_count}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function getReadySources(sourceList) {
  const sources = Array.isArray(sourceList) ? sourceList : (sourceList.sources || sourceList.items || []);
  return sources.filter(source => String(source.status || '').toLowerCase() === 'ready');
}

function normalizeNotebookSource(source) {
  return {
    id: source.id,
    title: source.title,
    type: source.type,
    status: source.status,
    index: source.index ?? null
  };
}

function getSourceMatchKind(title) {
  return /MIT6_0001F16_Lec/i.test(String(title || '')) ? 'lecture_pdf_title' : 'lecture_numbered_title';
}

function normalizeUnitInput(unit) {
  const value = String(unit).trim();
  const prefixed = value.match(/^u0*(\d{1,2})$/i);
  if (prefixed) return String(Number.parseInt(prefixed[1], 10));
  return value;
}

function buildUnitId(courseId, unitNumber) {
  const prefix = String(courseId || DEFAULT_COURSE_ID)
    .match(/^(\d+)-0*(\d+)/);
  const courseCode = prefix ? `${prefix[1]}-${prefix[2].padStart(4, '0')}` : DEFAULT_LEARNING_PATH_ID;
  return `${courseCode}:u${String(unitNumber).padStart(2, '0')}`;
}
