import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runAgentChat } from '../src/learning/agent/session/index.js';
import { readConversationLog, sha256File } from '../src/learning/agent/run-state/index.js';

const silentLogger = { log() {} };

test('agent E2E: Accounting Happy Path completed alle Steps accepted', async () => {
  const fixture = createFixture({ courses: [accountingCourse()] });
  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-accounting',
    provider: 'deterministic',
    goal: 'Ich will Accounting lernen',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes'])
  });

  assert.equal(result.state.status, 'completed');
  assert.equal(Object.values(result.state.steps).every(step => step.status === 'accepted'), true);
  assert.ok(existsSync(join(fixture.runDir, 'learning-path.json')));
  assert.ok(existsSync(join(fixture.runDir, 'path-notebook-state.json')));
});

test('agent E2E: Kardiologie no-candidate Pfad zeigt Recovery und erlaubt refine', async () => {
  const fixture = createFixture({ courses: [accountingCourse()] });
  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-kardiologie-recovery',
    provider: 'deterministic',
    goal: 'Kardiologie',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['broaden', 'refine', 'Ich will Accounting lernen', 'yes'])
  });

  const turns = readConversationLog(join(fixture.runDir, 'conversation.jsonl'));
  assert.equal(result.state.status, 'completed');
  assert.match(turns.map(turn => turn.text).join('\n'), /Aktion angenommen: broaden/);
  assert.match(turns.map(turn => turn.text).join('\n'), /Bitte gib ein schaerferes Lernziel ein/);
});

test('agent E2E: Kardiologie selector_terms bringen Cardiology-Kurs durch Selector und Topic-Fit', async () => {
  const fixture = createFixture({ courses: [cardiologyCourse()] });
  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-cardiology',
    provider: 'deterministic',
    goal: 'Kardiologie',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes'])
  });

  const candidates = readJson(join(fixture.runDir, 'candidates.json'));
  const review = result.state.steps.course_discovery.review;
  assert.equal(result.state.status, 'completed');
  assert.deepEqual(candidates.candidate_courses.map(candidate => candidate.course_id), ['hstm-cardiology']);
  assert.equal(review.data.verdicts[0].verdict, 'accept');
});

test('agent E2E: Accounting-Falle bleibt in raw, Downstream liest nur akzeptierte candidates.json', async () => {
  const fixture = createFixture({ courses: [accountingCourse(), accountingTitleOnlyCourse()] });
  await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-accounting-trap',
    provider: 'deterministic',
    goal: 'Accounting',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes'])
  });

  const raw = readJson(join(fixture.runDir, 'candidates.raw.json'));
  const accepted = readJson(join(fixture.runDir, 'candidates.json'));
  const screening = readJson(join(fixture.runDir, 'material-screening.json'));

  assert.ok(raw.candidate_courses.some(candidate => candidate.course_id === '15-title-only-accounting'));
  assert.equal(accepted.candidate_courses.some(candidate => candidate.course_id === '15-title-only-accounting'), false);
  assert.equal(screening.candidate_courses.some(candidate => candidate.course_id === '15-title-only-accounting'), false);
});

test('agent E2E: pure Low-Confidence wird erst nach continue anyway uebernommen', async () => {
  const fixture = createFixture({ courses: [accountingTitleOnlyCourse()] });
  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-low-confidence',
    provider: 'deterministic',
    goal: 'Accounting',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes', 'continue anyway', 'yes'])
  });

  const candidates = readJson(join(fixture.runDir, 'candidates.json'));
  const turns = readConversationLog(join(fixture.runDir, 'conversation.jsonl'));

  assert.equal(result.state.status, 'completed');
  assert.deepEqual(candidates.candidate_courses.map(candidate => candidate.course_id), ['15-title-only-accounting']);
  assert.match(turns.map(turn => turn.text).join('\n'), /Aktion angenommen: broaden/);
  assert.match(turns.map(turn => turn.text).join('\n'), /Aktion angenommen: continue_anyway/);
});

test('agent E2E: Coverage-Retry startet erst nach yes und materialisiert Sources', async () => {
  const fixture = createFixture({ courses: [noSourceAccountingCourse()] });
  let rescreenCalls = 0;
  let exportCalls = 0;

  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-coverage-retry',
    provider: 'deterministic',
    goal: 'Accounting',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes']),
    rescreener: async courseId => {
      rescreenCalls += 1;
      insertMaterialIntoDb(fixture.dbPath, {
        id: 701,
        course_id: courseId,
        title: 'Lecture 1: Accounting Sources',
        material_type: 'Lecture Notes',
        media_type: 'pdf',
        source_url: 'https://example.com/accounting-sources.pdf'
      });
      return { materials: 1 };
    },
    unitExporter: async courseIds => {
      exportCalls += 1;
      for (const courseId of courseIds) {
        writeCourseUnits(fixture.unitsRoot, courseId, [
          { unit_number: 1, title: 'Lecture 1: Accounting Sources', sources: [{ id: 701 }] }
        ]);
      }
      return courseIds.map(course_id => ({ course_id, unit_count: 1, assigned_sources: 1 }));
    }
  });

  const screening = readJson(join(fixture.runDir, 'material-screening.json'));
  assert.equal(result.state.status, 'completed');
  assert.equal(rescreenCalls, 1);
  assert.equal(exportCalls, 1);
  assert.equal(screening.usable_sources.length, 1);
});

test('agent E2E: Plan-Quality normalize_titles aktualisiert JSON, Markdown und State-Hash', async () => {
  const fixture = createFixture({ courses: [rawTitleCourse()] });
  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-plan-quality',
    provider: 'deterministic',
    goal: 'Accounting',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes'])
  });

  const planPath = join(fixture.runDir, 'learning-path.json');
  const markdownPath = join(fixture.runDir, 'learning-path.md');
  const plan = readJson(planPath);
  const markdown = readFileSync(markdownPath, 'utf8');

  assert.equal(result.state.status, 'completed');
  assert.equal(plan.units[0].title, 'Lecture 1');
  assert.match(markdown, /Lecture 1/);
  assert.equal(result.state.steps.learning_path.accepted_output.artifact_sha256, sha256File(planPath));
});

test('agent E2E: Resume erkennt manipuliertes Artefakt als stale und rerunnt ab diesem Step', async () => {
  const fixture = createFixture({ courses: [accountingCourse()] });
  await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-resume',
    provider: 'deterministic',
    goal: 'Accounting',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes'])
  });

  writeFileSync(join(fixture.runDir, 'candidates.json'), '{"candidate_courses":[]}\n', 'utf8');
  appendFileSync(join(fixture.runDir, 'conversation.jsonl'), '{"turn_id":"partial"', 'utf8');

  const result = await runAgentChat({
    action: 'chat',
    runId: 'agent-e2e-resume',
    provider: 'deterministic',
    outDir: fixture.runDir,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['yes'])
  });
  const candidates = readJson(join(fixture.runDir, 'candidates.json'));
  const turns = readConversationLog(join(fixture.runDir, 'conversation.jsonl'));

  assert.equal(result.state.status, 'completed');
  assert.equal(result.state.resume_events[0].step, 'course_discovery');
  assert.ok(candidates.candidate_courses.length > 0);
  assert.equal(turns.some(turn => turn.turn_id === 'partial'), false);
});

test('agent E2E: vages Anfangsziel blockiert nicht, freie Ziel-Eingabe fuehrt durch', async () => {
  const fixture = createFixture({ courses: [accountingCourse()] });
  const result = await runAgentChat({
    action: 'chat',
    newRun: true,
    runId: 'agent-e2e-vague-goal',
    provider: 'deterministic',
    goal: 'lernen',
    outDir: fixture.runDir,
    dbPath: fixture.dbPath,
    unitsRoot: fixture.unitsRoot,
    dryRun: true
  }, {
    logger: silentLogger,
    question: scriptedQuestion(['Ich will Accounting lernen', 'yes'])
  });

  const turns = readConversationLog(join(fixture.runDir, 'conversation.jsonl'));
  assert.equal(result.state.status, 'completed');
  assert.match(turns.map(turn => turn.text).join('\n'), /Lernziel aktualisiert: Ich will Accounting lernen/);
  assert.ok(existsSync(join(fixture.runDir, 'reviews', 'goal_expansion.review.json')));
});

function createFixture({ courses }) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-e2e-'));
  const dbPath = join(dir, 'library.db');
  const unitsRoot = join(dir, 'units');
  const runDir = join(dir, 'run');
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

  for (const course of courses) {
    insertCourse(db, course);
    if (course.units) writeCourseUnits(unitsRoot, course.course_id, course.units);
  }
  db.close();

  return { dir, dbPath, unitsRoot, runDir };
}

function accountingCourse() {
  return {
    course_id: '15-501-accounting',
    title: 'Financial Accounting',
    topics: [['Business', 'Accounting', 'Finance']],
    learning_resource_types: ['Lecture Notes', 'Problem Sets'],
    materials: [
      material(101, 'Lecture 1: Accounting Foundations', 'Lecture Notes', 'pdf'),
      material(102, 'Problem Set 1', 'Problem Sets', 'pdf')
    ],
    units: [
      { unit_number: 1, title: 'Lecture 1: Accounting Foundations', sources: [{ id: 101 }, { id: 102 }] }
    ]
  };
}

function cardiologyCourse() {
  return {
    course_id: 'hstm-cardiology',
    title: 'Clinical Systems and Cardiovascular Care',
    topics: [['Health', 'Cardiology', 'Cardiovascular Medicine']],
    learning_resource_types: ['Lecture Notes'],
    materials: [
      material(201, 'Lecture 1: Cardiovascular Systems', 'Lecture Notes', 'pdf')
    ],
    units: [
      { unit_number: 1, title: 'Lecture 1: Cardiovascular Systems', sources: [{ id: 201 }] }
    ]
  };
}

function accountingTitleOnlyCourse() {
  return {
    course_id: '15-title-only-accounting',
    title: 'Accounting for Strategic Decisions',
    topics: [['Management', 'Operations']],
    learning_resource_types: ['Lecture Notes'],
    materials: [
      material(301, 'Lecture 1: Operations Strategy', 'Lecture Notes', 'pdf')
    ],
    units: [
      { unit_number: 1, title: 'Lecture 1: Operations Strategy', sources: [{ id: 301 }] }
    ]
  };
}

function noSourceAccountingCourse() {
  return {
    course_id: '15-no-source-accounting',
    title: 'Financial Accounting Recovery',
    topics: [['Business', 'Accounting', 'Finance']],
    learning_resource_types: ['Lecture Notes'],
    materials: [],
    units: null
  };
}

function rawTitleCourse() {
  return {
    course_id: '15-raw-title-accounting',
    title: 'Financial Accounting with Raw Titles',
    topics: [['Business', 'Accounting', 'Finance']],
    learning_resource_types: ['Lecture Notes'],
    materials: [
      material(601, 'lec1.pdf', 'Lecture Notes', 'pdf')
    ],
    units: [
      { unit_number: 1, title: 'lec1.pdf', sources: [{ id: 601 }] }
    ]
  };
}

function material(id, title, material_type, media_type) {
  return {
    id,
    title,
    material_type,
    media_type,
    source_url: `https://example.com/${id}.pdf`
  };
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

  for (const item of course.materials || []) {
    db.prepare(`
      INSERT INTO materials (
        id,
        course_id,
        title,
        material_type,
        media_type,
        source_url,
        local_path,
        resource_path,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)
    `).run(item.id, course.course_id, item.title, item.material_type, item.media_type, item.source_url, `/${item.title.toLowerCase().replaceAll(' ', '-')}`);
  }
}

function insertMaterialIntoDb(dbPath, item) {
  const db = new Database(dbPath);
  try {
    db.prepare(`
      INSERT INTO materials (
        id,
        course_id,
        title,
        material_type,
        media_type,
        source_url,
        local_path,
        resource_path,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)
    `).run(item.id, item.course_id, item.title, item.material_type, item.media_type, item.source_url, `/${item.title.toLowerCase().replaceAll(' ', '-')}`);
  } finally {
    db.close();
  }
}

function writeCourseUnits(root, courseId, units) {
  if (!units) return;
  mkdirSync(join(root, courseId), { recursive: true });
  writeFileSync(join(root, courseId, 'course_units.json'), JSON.stringify({ units }));
}

function scriptedQuestion(values) {
  let index = 0;
  return async () => values[index++] || 'yes';
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
