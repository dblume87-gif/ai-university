import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getLearnCandidatesOptions,
  getLearnContractOptions,
  normalizeLearningContract,
  saveCandidateSelection,
  saveLearningContract,
  selectCourseCandidates
} from '../src/learning/contract.js';

test('getLearnContractOptions: liest CLI Contract-Felder', () => {
  const options = getLearnContractOptions([
    '--goal', 'Ich will AI Apps bauen',
    '--current-level', 'beginner',
    '--target-outcome', 'prototype',
    '--style', 'practical',
    '--language', 'de',
    '--preferred-materials', 'lecture videos,projects'
  ]);

  assert.equal(options.goal, 'Ich will AI Apps bauen');
  assert.equal(options.currentLevel, 'beginner');
  assert.deepEqual(options.preferredMaterials, ['lecture videos', 'projects']);
});

test('getLearnCandidatesOptions: limitiert Top-K auf maximal 5', () => {
  const options = getLearnCandidatesOptions(['--contract', 'contract.json', '--limit', '12']);

  assert.equal(options.contractPath, 'contract.json');
  assert.equal(options.limit, 5);
});

test('normalizeLearningContract: setzt Defaults und Feldnutzung', () => {
  const contract = normalizeLearningContract({ goal: 'Ich will AI Apps bauen' });

  assert.equal(contract.current_level, 'beginner');
  assert.equal(contract.target_outcome, 'prototype');
  assert.equal(contract.style, 'practical');
  assert.equal(contract.language, 'de');
  assert.equal(contract.field_usage.language, 'response_asset_language_metadata');
});

test('normalizeLearningContract: zu vager Contract bricht ab', () => {
  assert.throws(
    () => normalizeLearningContract({ goal: 'AI' }),
    /zu vage/
  );
});

test('selectCourseCandidates: AI Apps priorisiert Python/GenAI/Prompting vor Mathe-only', () => {
  const dbPath = createFixtureDb([
    course({
      course_id: '6-0001-python',
      title: 'Introduction to Computer Science and Programming in Python',
      topics: [['Engineering', 'Computer Science', 'Programming Languages']],
      learning_resource_types: ['Lecture Videos', 'Programming Assignments with Examples', 'Problem Sets'],
      lectureVideos: 12,
      projects: 4,
      psets: 6
    }),
    course({
      course_id: '18-999-math',
      title: 'Advanced Abstract Mathematics',
      topics: [['Mathematics']],
      learning_resource_types: ['Lecture Notes'],
      documents: 10,
      tier_score: 40
    }),
    course({
      course_id: '6-s087-genai',
      title: 'Foundation Models and Generative AI',
      topics: [['Engineering', 'Computer Science', 'Artificial Intelligence']],
      learning_resource_types: ['Lecture Videos', 'Projects with Examples'],
      lectureVideos: 6,
      projects: 5,
      tier_score: 35
    }),
    course({
      course_id: '14-01-microeconomics',
      title: 'Principles of Microeconomics',
      topics: [['Social Science', 'Economics']],
      learning_resource_types: ['Lecture Videos', 'Problem Sets'],
      lectureVideos: 24,
      psets: 16,
      tier_score: 40
    })
  ]);
  const contract = normalizeLearningContract({
    goal: 'Ich will AI Apps bauen',
    current_level: 'beginner',
    target_outcome: 'prototype',
    style: 'practical',
    preferred_materials: ['lecture videos', 'projects']
  });

  const selection = selectCourseCandidates({ contract, dbPath, limit: 3 });

  assert.equal(selection.candidate_courses.length, 2);
  assert.ok(!selection.candidate_courses.some(candidate => candidate.course_id === '18-999-math'));
  assert.ok(!selection.candidate_courses.some(candidate => candidate.course_id === '14-01-microeconomics'));
  assert.ok(selection.candidate_courses.slice(0, 2).some(candidate => candidate.course_id === '6-0001-python'));
  assert.ok(selection.candidate_courses.slice(0, 2).some(candidate => candidate.course_id === '6-s087-genai'));
  assert.ok(selection.candidate_courses.every(candidate => candidate.thematic_fit.gate === 'passed'));
  assert.ok(selection.candidate_courses.every(candidate => !('course_units' in candidate.field_contributions)));
  assert.ok(selection.candidate_courses.every(candidate => !('has_course_units' in candidate.signals)));
});

test('selectCourseCandidates: Backprop priorisiert Neural-Network-/Calculus-nahe Kurse', () => {
  const dbPath = createFixtureDb([
    course({
      course_id: '18-s096-matrix-calculus',
      title: 'Matrix Calculus for Machine Learning and Beyond',
      topics: [['Mathematics', 'Calculus'], ['Engineering', 'Computer Science', 'Machine Learning']],
      learning_resource_types: ['Lecture Notes', 'Problem Sets'],
      psets: 5,
      documents: 8
    }),
    course({
      course_id: '6-036-neural-networks',
      title: 'Introduction to Machine Learning and Neural Networks',
      topics: [['Engineering', 'Computer Science', 'Artificial Intelligence']],
      learning_resource_types: ['Lecture Videos', 'Problem Sets'],
      lectureVideos: 8,
      psets: 4
    }),
    course({
      course_id: '14-001-economics',
      title: 'Principles of Microeconomics',
      topics: [['Social Science', 'Economics']],
      learning_resource_types: ['Lecture Videos'],
      lectureVideos: 10
    })
  ]);

  const selection = selectCourseCandidates({
    dbPath,
    limit: 3,
    goal: 'Ich will Backprop verstehen',
    currentLevel: 'beginner',
    targetOutcome: 'mastery',
    style: 'conceptual'
  });

  assert.ok(selection.candidate_courses[0].course_id.includes('matrix') || selection.candidate_courses[0].course_id.includes('neural'));
  assert.ok(selection.candidate_courses[0].field_contributions.goal.contribution > 0);
});

test('selectCourseCandidates: selector_terms bringen uebersetztes Goal vor dem Review durch den Selector', () => {
  const dbPath = createFixtureDb([
    course({
      course_id: 'hstm-cardiology',
      title: 'Cardiology Fundamentals',
      topics: [['Health Sciences', 'Cardiology']],
      learning_resource_types: ['Lecture Notes'],
      documents: 8,
      tier_score: 30
    }),
    course({
      course_id: '18-999-math',
      title: 'Advanced Abstract Mathematics',
      topics: [['Mathematics']],
      learning_resource_types: ['Lecture Notes'],
      documents: 10,
      tier_score: 40
    })
  ]);
  const contract = normalizeLearningContract({
    goal: 'Ich will Kardiologie lernen',
    current_level: 'beginner',
    target_outcome: 'mastery',
    style: 'conceptual'
  });

  const withoutBridge = selectCourseCandidates({ contract, dbPath, limit: 3 });
  const withBridge = selectCourseCandidates({
    contract,
    dbPath,
    limit: 3,
    selector_terms: ['cardiology', 'cardiovascular']
  });

  assert.equal(contract.goal, 'Ich will Kardiologie lernen');
  assert.equal(withoutBridge.candidate_courses.length, 0);
  assert.equal(withBridge.candidate_courses.length, 1);
  assert.equal(withBridge.candidate_courses[0].course_id, 'hstm-cardiology');
  assert.deepEqual(withBridge.candidate_courses[0].thematic_fit.matched_tokens, ['cardiology']);
});

test('selectCourseCandidates: selector_terms ignorieren reine Kurs-Fuellwoerter', () => {
  const dbPath = createFixtureDb([
    course({
      course_id: '6-0001-python',
      title: 'Introduction to Computer Science and Programming in Python',
      topics: [['Engineering', 'Computer Science', 'Programming Languages']],
      learning_resource_types: ['Lecture Videos', 'Problem Sets'],
      lectureVideos: 12,
      psets: 6,
      tier_score: 40
    })
  ]);
  const contract = normalizeLearningContract({
    goal: 'Ich will Business Strategy lernen',
    current_level: 'beginner',
    target_outcome: 'prototype',
    style: 'practical'
  });

  const selection = selectCourseCandidates({
    contract,
    dbPath,
    limit: 5,
    selector_terms: ['go-to-market strategy course', 'business strategy fundamentals']
  });

  assert.equal(selection.candidate_courses.some(candidate => candidate.course_id === '6-0001-python'), false);
});

test('saveLearningContract/saveCandidateSelection: schreibt JSON-Artefakte', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-contract-save-'));
  const contract = normalizeLearningContract({ goal: 'Ich will AI Apps bauen', contractId: 'contract-1' });
  const contractPath = saveLearningContract(contract, join(dir, 'contract.json'));
  const selectionPath = saveCandidateSelection({
    contract_id: contract.contract_id,
    normalized_contract: contract,
    candidate_courses: []
  }, join(dir, 'candidates.json'));

  assert.equal(JSON.parse(readFileSync(contractPath, 'utf8')).contract_id, 'contract-1');
  assert.equal(JSON.parse(readFileSync(selectionPath, 'utf8')).contract_id, 'contract-1');
});

function createFixtureDb(courses) {
  const dir = mkdtempSync(join(tmpdir(), 'candidate-db-'));
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
      material_type TEXT,
      media_type TEXT
    );
  `);
  const insertCourse = db.prepare(`
    INSERT INTO courses VALUES (
      @course_id,
      @title,
      @source_url,
      @level,
      @topics,
      @learning_resource_types,
      @status,
      @tier,
      @tier_score,
      @screening_reason,
      @notebooklm_status,
      @notebooklm_manifest_path
    )
  `);
  const insertMaterial = db.prepare('INSERT INTO materials (course_id, material_type, media_type) VALUES (?, ?, ?)');
  for (const item of courses) {
    insertCourse.run(item);
    for (let i = 0; i < item.lectureVideos; i++) insertMaterial.run(item.course_id, 'Lecture Videos', 'youtube');
    for (let i = 0; i < item.projects; i++) insertMaterial.run(item.course_id, 'Programming Assignments', 'pdf');
    for (let i = 0; i < item.psets; i++) insertMaterial.run(item.course_id, 'Problem Sets', 'pdf');
    for (let i = 0; i < item.documents; i++) insertMaterial.run(item.course_id, 'Lecture Notes', 'pdf');
  }
  db.close();
  return dbPath;
}

function course(overrides) {
  return {
    course_id: 'course',
    title: 'Course',
    source_url: null,
    level: JSON.stringify(['Undergraduate']),
    topics: JSON.stringify([]),
    learning_resource_types: JSON.stringify([]),
    status: 'uploaded_to_notebooklm',
    tier: 1,
    tier_score: 35,
    screening_reason: '',
    notebooklm_status: 'uploaded_to_notebooklm',
    notebooklm_manifest_path: null,
    lectureVideos: 0,
    projects: 0,
    psets: 0,
    documents: 0,
    ...overrides,
    topics: JSON.stringify(overrides.topics || []),
    learning_resource_types: JSON.stringify(overrides.learning_resource_types || []),
    level: JSON.stringify(overrides.level || ['Undergraduate'])
  };
}
