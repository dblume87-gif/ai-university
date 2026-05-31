import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getScreenMaterialsOptions,
  saveMaterialScreening,
  screenCandidateMaterials
} from '../src/learning/material-screening.js';

test('getScreenMaterialsOptions: liest Candidate-Pfad und begrenzt Top-K', () => {
  const options = getScreenMaterialsOptions(['--candidates', 'candidates.json', '--top', '9']);

  assert.equal(options.candidatesPath, 'candidates.json');
  assert.equal(options.top, 5);
});

test('screenCandidateMaterials: nutzt cached course_units und trennt usable sources von gaps', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'screen-materials-'));
  const dbPath = createDb(dir);
  const unitsRoot = join(dir, 'units');
  mkdirSync(join(unitsRoot, 'course-a'), { recursive: true });
  writeFileSync(join(unitsRoot, 'course-a', 'course_units.json'), JSON.stringify({
    units: [{ unit_number: 1, title: 'Intro', sources: [{ id: 1, title: 'Lecture 1' }] }]
  }));

  const screening = await screenCandidateMaterials({
    dbPath,
    unitsRoot,
    rescreenMissing: false,
    candidateSelection: {
      contract_id: 'contract-1',
      normalized_contract: { goal: 'AI Apps', preferred_materials: ['lecture videos'] },
      candidate_courses: [
        { course_id: 'course-a', title: 'Course A', score: 42 },
        { course_id: 'course-b', title: 'Course B', score: 12 }
      ]
    }
  });

  assert.equal(screening.course_material_overviews.length, 2);
  assert.equal(screening.course_material_overviews[0].cache_status, 'cached_units_available');
  assert.equal(screening.course_material_overviews[0].usable_sources.length, 1);
  assert.equal(screening.course_material_overviews[1].cache_status, 'needs_unit_export');
  assert.equal(screening.unit_export.skipped[0].reason, 'custom_db_without_unit_exporter');
  assert.ok(screening.gaps.some(gap => gap.code === 'missing_course_units' && gap.course_id === 'course-b'));
  assert.ok(screening.gaps.some(gap => gap.code === 'no_usable_sources' && gap.course_id === 'course-b'));
});

test('screenCandidateMaterials: rescreent Kandidaten mit deklarierten aber fehlenden Materialien', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'screen-materials-rescreen-'));
  const dbPath = createDb(dir);
  const unitsRoot = join(dir, 'units');
  mkdirSync(join(unitsRoot, 'course-c'), { recursive: true });
  writeFileSync(join(unitsRoot, 'course-c', 'course_units.json'), JSON.stringify({
    units: [{ unit_number: 1, title: 'Accounting Intro', sources: [{ id: 3, title: 'Lecture Note' }] }]
  }));

  const screening = await screenCandidateMaterials({
    dbPath,
    unitsRoot,
    candidateSelection: {
      contract_id: 'contract-1',
      normalized_contract: { goal: 'Accounting', preferred_materials: ['readings'] },
      candidate_courses: [
        {
          course_id: 'course-c',
          title: 'Course C',
          score: 33,
          signals: {
            learning_resource_types: ['Lecture Notes']
          }
        }
      ]
    },
    rescreener: async courseId => {
      insertMaterial(dbPath, 3, courseId, 'Lecture Note', 'Lecture Notes', 'pdf', 'https://example.com/note.pdf');
      return { courseId, materials: 1 };
    }
  });

  assert.deepEqual(screening.rescreen.attempted, ['course-c']);
  assert.equal(screening.rescreen.results[0].status, 'completed');
  assert.equal(screening.usable_sources.length, 1);
  assert.equal(screening.usable_sources[0].material_id, 3);
  assert.ok(!screening.gaps.some(gap => gap.code === 'no_material_rows' && gap.course_id === 'course-c'));
});

test('screenCandidateMaterials: exportiert fehlende Units nach Materialisierung', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'screen-materials-units-'));
  const dbPath = createDb(dir);
  const unitsRoot = join(dir, 'units');

  const screening = await screenCandidateMaterials({
    dbPath,
    unitsRoot,
    candidateSelection: {
      contract_id: 'contract-1',
      normalized_contract: { goal: 'Accounting', preferred_materials: ['lecture notes'] },
      candidate_courses: [
        {
          course_id: 'course-d',
          title: 'Course D',
          score: 31,
          signals: {
            learning_resource_types: ['Lecture Notes']
          }
        }
      ]
    },
    rescreener: async courseId => {
      insertMaterial(dbPath, 4, courseId, 'Lecture 1: Balance Sheet', 'Lecture Notes', 'pdf', 'https://example.com/lecture-1.pdf');
      return { courseId, materials: 1 };
    },
    unitExporter: async (courseIds, options) => {
      for (const courseId of courseIds) {
        mkdirSync(join(options.outRoot, courseId), { recursive: true });
        writeFileSync(join(options.outRoot, courseId, 'course_units.json'), JSON.stringify({
          units: [{ unit_number: 1, title: 'Balance Sheet', sources: [{ id: 4 }] }]
        }));
      }
      return courseIds.map(courseId => ({
        course_id: courseId,
        unit_count: 1,
        assigned_sources: 1,
        jsonPath: join(options.outRoot, courseId, 'course_units.json')
      }));
    }
  });

  assert.deepEqual(screening.unit_export.attempted, ['course-d']);
  assert.equal(screening.unit_export.results[0].status, 'completed');
  assert.equal(screening.course_material_overviews[0].cache_status, 'cached_units_available');
  assert.equal(screening.course_material_overviews[0].unit_count, 1);
  assert.ok(!screening.gaps.some(gap => gap.code === 'missing_course_units' && gap.course_id === 'course-d'));
});

test('saveMaterialScreening: schreibt JSON Output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'screen-save-'));
  const path = saveMaterialScreening({
    contract_id: 'contract-1',
    course_material_overviews: [],
    usable_sources: [],
    gaps: []
  }, join(dir, 'screening.json'));

  assert.equal(JSON.parse(readFileSync(path, 'utf8')).contract_id, 'contract-1');
});

function createDb(dir) {
  const dbPath = join(dir, 'library.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE materials (
      id INTEGER PRIMARY KEY,
      course_id TEXT,
      title TEXT,
      material_type TEXT,
      media_type TEXT,
      source_url TEXT,
      local_path TEXT,
      resource_path TEXT,
      metadata_json TEXT
    );
  `);
  db.prepare('INSERT INTO materials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    1,
    'course-a',
    'Lecture 1',
    'Lecture Videos',
    'youtube',
    'https://youtube.com/watch?v=abc',
    null,
    '/lecture-1',
    null
  );
  db.prepare('INSERT INTO materials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    2,
    'course-b',
    'External Site',
    'Readings',
    'html',
    'https://example.com/page',
    null,
    '/external',
    null
  );
  db.close();
  return dbPath;
}

function insertMaterial(dbPath, id, courseId, title, materialType, mediaType, sourceUrl) {
  const db = new Database(dbPath);
  db.prepare('INSERT INTO materials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    courseId,
    title,
    materialType,
    mediaType,
    sourceUrl,
    null,
    `/${title.toLowerCase().replaceAll(' ', '-')}`,
    null
  );
  db.close();
}
