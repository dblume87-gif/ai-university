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

test('screenCandidateMaterials: nutzt cached course_units und trennt usable sources von gaps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'screen-materials-'));
  const dbPath = createDb(dir);
  const unitsRoot = join(dir, 'units');
  mkdirSync(join(unitsRoot, 'course-a'), { recursive: true });
  writeFileSync(join(unitsRoot, 'course-a', 'course_units.json'), JSON.stringify({
    units: [{ unit_number: 1, title: 'Intro', sources: [{ id: 1, title: 'Lecture 1' }] }]
  }));

  const screening = screenCandidateMaterials({
    dbPath,
    unitsRoot,
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
  assert.ok(screening.gaps.some(gap => gap.code === 'missing_course_units' && gap.course_id === 'course-b'));
  assert.ok(screening.gaps.some(gap => gap.code === 'no_usable_sources' && gap.course_id === 'course-b'));
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
