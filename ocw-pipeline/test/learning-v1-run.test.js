import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getV1RunOptions,
  runV1Harness
} from '../src/learning/v1-run.js';

test('getV1RunOptions: liest V1 Run Optionen und defaultet auf dry-run', () => {
  const options = getV1RunOptions([
    'run',
    '--goal', 'Ich will AI Apps bauen',
    '--limit', '9',
    '--max-sources', '80'
  ]);

  assert.equal(options.action, 'run');
  assert.equal(options.goal, 'Ich will AI Apps bauen');
  assert.equal(options.limit, 5);
  assert.equal(options.maxSources, 60);
  assert.equal(options.dryRun, true);
});

test('runV1Harness: Golden Scenario erzeugt Run-Artefakte und sources_ready dry-run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'v1-run-'));
  const dbPath = createFixtureDb(dir);
  const unitsRoot = createUnitsRoot(dir);
  const runDir = join(dir, 'run');

  const result = await runV1Harness({
    action: 'run',
    goal: 'Ich will AI Apps bauen',
    currentLevel: 'beginner',
    targetOutcome: 'prototype',
    style: 'practical',
    language: 'de',
    preferredMaterials: ['lecture videos', 'projects'],
    outDir: runDir,
    dbPath,
    unitsRoot,
    maxUnits: 4,
    maxSources: 10,
    limit: 5,
    top: 5,
    dryRun: true
  }, async () => {
    throw new Error('runner should not be called in dry-run');
  });

  assert.equal(result.run.status, 'completed');
  assert.equal(result.run.mode, 'dry_run');
  assert.equal(result.run.steps.map(step => step.name).join(','), 'contract,candidates,materials,plan,notebook');
  assert.equal(result.run.gates.every(gate => gate.status === 'passed'), true);
  assert.equal(result.run.handoffs.mindmap.status, 'skipped:live_notebook_required');

  const candidates = JSON.parse(readFileSync(join(runDir, 'candidates.json'), 'utf8'));
  assert.ok(candidates.candidate_courses.length > 0);
  assert.ok(!candidates.candidate_courses.some(candidate => candidate.course_id === '14-01-microeconomics'));
  assert.ok(candidates.candidate_courses.every(candidate => candidate.thematic_fit.gate === 'passed'));

  const state = JSON.parse(readFileSync(join(runDir, 'path-notebook-state.json'), 'utf8'));
  assert.equal(state.status, 'sources_ready');
  assert.ok(state.sources.length <= 10);

  assert.ok(JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf8')).gates.length > 0);
  assert.ok(readFileSync(join(runDir, 'RUN.md'), 'utf8').includes('V1 Run'));
});

test('runV1Harness: Fehlerfall schreibt fehlgeschlagenen Run mit Diagnose', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'v1-run-fail-'));
  const result = await runV1Harness({
    action: 'run',
    goal: 'AI',
    outDir: join(dir, 'run'),
    dbPath: join(dir, 'missing.db')
  });

  assert.equal(result.run.status, 'failed');
  assert.match(result.run.error.message, /zu vage/);
  assert.equal(result.run.steps[0].name, 'contract');
  assert.equal(result.run.steps[0].status, 'failed');
  assert.ok(readFileSync(join(dir, 'run', 'run.json'), 'utf8').includes('zu vage'));
});

function createFixtureDb(dir) {
  const dbPath = join(dir, 'library.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE courses (
      course_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT,
      level TEXT,
      topics TEXT,
      learning_resource_types TEXT,
      status TEXT,
      tier INTEGER,
      tier_score INTEGER,
      screening_reason TEXT,
      notebooklm_status TEXT,
      notebooklm_manifest_path TEXT
    );
    CREATE TABLE materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  insertCourse(db, {
    course_id: '6-0001-python',
    title: 'Introduction to Computer Science and Programming in Python',
    topics: [['Engineering', 'Computer Science', 'Programming Languages']],
    learning_resource_types: ['Lecture Videos', 'Programming Assignments with Examples', 'Problem Sets'],
    lectureVideos: 2,
    psets: 2
  });
  insertCourse(db, {
    course_id: '6-s087-genai',
    title: 'Foundation Models and Generative AI',
    topics: [['Engineering', 'Computer Science', 'Artificial Intelligence']],
    learning_resource_types: ['Lecture Videos', 'Projects with Examples'],
    lectureVideos: 1,
    psets: 1
  });
  insertCourse(db, {
    course_id: '14-01-microeconomics',
    title: 'Principles of Microeconomics',
    topics: [['Social Science', 'Economics']],
    learning_resource_types: ['Lecture Videos', 'Problem Sets'],
    lectureVideos: 5,
    psets: 5
  });
  db.close();
  return dbPath;
}

function insertCourse(db, course) {
  db.prepare(`
    INSERT INTO courses VALUES (
      @course_id,
      @title,
      NULL,
      @level,
      @topics,
      @learning_resource_types,
      'uploaded_to_notebooklm',
      1,
      35,
      '',
      'uploaded_to_notebooklm',
      NULL
    )
  `).run({
    ...course,
    level: JSON.stringify(['Undergraduate']),
    topics: JSON.stringify(course.topics || []),
    learning_resource_types: JSON.stringify(course.learning_resource_types || [])
  });

  for (let i = 0; i < (course.lectureVideos || 0); i++) {
    insertMaterial(db, course.course_id, `Lecture ${i + 1}`, 'Lecture Videos', 'youtube', `https://youtube.com/watch?v=${course.course_id}-${i}`);
  }
  for (let i = 0; i < (course.psets || 0); i++) {
    insertMaterial(db, course.course_id, `Problem Set ${i + 1}`, 'Problem Sets', 'pdf', `https://example.com/${course.course_id}/ps${i + 1}.pdf`);
  }
}

function insertMaterial(db, courseId, title, materialType, mediaType, sourceUrl) {
  db.prepare(`
    INSERT INTO materials (
      course_id,
      title,
      material_type,
      media_type,
      source_url,
      local_path,
      resource_path,
      metadata_json
    )
    VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)
  `).run(courseId, title, materialType, mediaType, sourceUrl, `/${title.toLowerCase().replaceAll(' ', '-')}`);
}

function createUnitsRoot(dir) {
  const root = join(dir, 'units');
  writeCourseUnits(root, '6-0001-python', [
    { unit_number: 1, title: 'What is Computation?', sources: [{ id: 1 }, { id: 3 }] },
    { unit_number: 2, title: 'Python Basics', sources: [{ id: 2 }, { id: 4 }] }
  ]);
  writeCourseUnits(root, '6-s087-genai', [
    { unit_number: 1, title: 'Foundation Models', sources: [{ id: 5 }, { id: 6 }] }
  ]);
  return root;
}

function writeCourseUnits(root, courseId, units) {
  mkdirSync(join(root, courseId), { recursive: true });
  writeFileSync(join(root, courseId, 'course_units.json'), JSON.stringify({ units }));
}
