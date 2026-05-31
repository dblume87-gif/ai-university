import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { selectCourseCandidates } from '../../ocw-pipeline/src/learning/contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '../data/library.db');

test('mvp boundary: imports ocw-pipeline selector against local library copy', () => {
  assert.equal(existsSync(dbPath), true);

  const selection = selectCourseCandidates({
    dbPath,
    limit: 5,
    goal: 'Ich will Business Strategy lernen',
    currentLevel: 'beginner',
    targetOutcome: 'prototype',
    style: 'practical',
    selector_terms: [
      'business strategy',
      'strategic management',
      'strategy'
    ]
  });

  assert.ok(selection.candidate_courses.length > 0);
  assert.equal(selection.candidate_courses.every(course => course.thematic_fit?.gate === 'passed'), true);
  assert.equal(
    selection.candidate_courses.some(course => /strategy|strategic/i.test(course.title)),
    true
  );
});
