import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  dispatchActiveCardInput,
  getAgentSessionOptions,
  runAgentChat,
  runAgentStatus
} from '../src/learning/agent/session/index.js';

const silentLogger = {
  log() {}
};

test('getAgentSessionOptions: parsed learn agent chat defaults to auto-provider dry-run', () => {
  const options = getAgentSessionOptions([
    'chat',
    '--new',
    '--goal', 'Ich will AI Apps bauen',
    '--limit', '9',
    '--max-sources', '80'
  ]);

  assert.equal(options.action, 'chat');
  assert.equal(options.newRun, true);
  assert.equal(options.provider, 'auto');
  assert.equal(options.dryRun, true);
  assert.equal(options.goal, 'Ich will AI Apps bauen');
  assert.equal(options.limit, 5);
  assert.equal(options.maxSources, 60);
});

test('runAgentChat: deterministic happy path schreibt State und akzeptierte Artefakte', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-session-'));
  const dbPath = createFixtureDb(dir);
  const unitsRoot = createUnitsRoot(dir);
  const runDir = join(dir, 'run');

  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-happy',
    smokePath: join(dir, 'missing-smoke.json'),
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
  }, {
    logger: silentLogger,
    question: async () => 'yes',
    notebookRunner: async () => {
      throw new Error('notebook runner should not be called in dry-run');
    }
  });

  assert.equal(result.state.status, 'completed');
  assert.equal(result.state.phase, 'loslernen');
  assert.equal(result.state.mode, 'dry_run');
  assert.equal(result.state.providers.agent.requested_adapter, 'auto');
  assert.equal(result.state.providers.agent.adapter, 'deterministic');
  assert.equal(result.state.active_card, null);
  assert.deepEqual(Object.keys(result.state.steps), [
    'learning_contract',
    'goal_expansion',
    'course_discovery',
    'source_coverage',
    'learning_path',
    'notebook_readiness'
  ]);
  assert.equal(Object.values(result.state.steps).every(step => step.status === 'accepted'), true);

  const state = JSON.parse(readFileSync(join(runDir, 'agent_state.json'), 'utf8'));
  assert.equal(state.status, 'completed');
  assert.ok(existsSync(join(runDir, 'AGENT_RUN.md')));
  assert.ok(existsSync(join(runDir, 'candidates.raw.json')));
  assert.ok(existsSync(join(runDir, 'candidates.json')));
  assert.ok(existsSync(join(runDir, 'learning-path.json')));
  assert.ok(existsSync(join(runDir, 'learning-path.md')));

  const candidates = JSON.parse(readFileSync(join(runDir, 'candidates.json'), 'utf8'));
  assert.ok(candidates.candidate_courses.length > 0);
  assert.equal(candidates.candidate_courses.some(candidate => candidate.course_id === '14-01-microeconomics'), false);

  const notebook = JSON.parse(readFileSync(join(runDir, 'path-notebook-state.json'), 'utf8'));
  assert.equal(notebook.status, 'sources_ready');

  const status = runAgentStatus({ runId: 'agent-happy', outDir: runDir });
  assert.equal(status.state.status, 'completed');
});

test('runAgentChat: Kardiologie ohne Kandidaten wartet mit gate-skopierter Recovery-Card', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-kardiologie-'));
  const dbPath = createFixtureDb(dir);
  const runDir = join(dir, 'run');

  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-kardiologie',
    smokePath: join(dir, 'missing-smoke.json'),
    goal: 'Kardiologie',
    outDir: runDir,
    dbPath,
    limit: 5,
    dryRun: true
  }, {
    logger: silentLogger
  });

  assert.equal(result.state.status, 'waiting_for_user');
  assert.equal(result.state.active_card.step, 'course_discovery');
  assert.equal(result.state.active_card.review.default_action, 'broaden');
  assert.ok(existsSync(result.state.active_card.card_path));
  assert.ok(!existsSync(join(runDir, 'candidates.json')));
});

test('dispatchActiveCardInput: yes nur fuer sichere Default-Aktionen, Actions bleiben gate-skopiert', () => {
  const activeCard = {
    review: {
      decision: 'ask_user',
      default_action: null,
      proposed_actions: [
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
      ]
    }
  };

  const yes = dispatchActiveCardInput('yes', activeCard);
  const explicit = dispatchActiveCardInput('continue anyway', activeCard);
  const unavailable = dispatchActiveCardInput('deep scan', activeCard);
  const typo = dispatchActiveCardInput('broadn', {
    review: {
      decision: 'retry',
      default_action: null,
      proposed_actions: [
        { action: 'broaden', label: 'Breiter suchen', params: {}, safe_default: false }
      ]
    }
  });

  assert.equal(yes.type, 'unavailable');
  assert.equal(explicit.type, 'action');
  assert.equal(explicit.action, 'continue_anyway');
  assert.equal(unavailable.type, 'unavailable');
  assert.equal(typo.action, 'broaden');
});

test('dispatchActiveCardInput: nummerierte Kursauswahl uebernimmt nur sichtbare Optionen', () => {
  const activeCard = {
    candidate_options: [
      { index: 1, course_id: '15-title-only-accounting', title: 'Accounting for Strategic Decisions' },
      { index: 2, course_id: '15-501-accounting', title: 'Financial Accounting' }
    ],
    review: {
      decision: 'ask_user',
      default_action: null,
      proposed_actions: []
    }
  };

  const selection = dispatchActiveCardInput('1, 2', activeCard);
  const missing = dispatchActiveCardInput('3', activeCard);

  assert.equal(selection.type, 'candidate_selection');
  assert.deepEqual(selection.candidate_ids, ['15-title-only-accounting', '15-501-accounting']);
  assert.equal(missing.type, 'unavailable');
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
