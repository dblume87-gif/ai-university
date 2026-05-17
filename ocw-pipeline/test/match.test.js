import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreNotebookCourseMatch, matchNotebooksToCourses } from '../src/notebooklm/match.js';

const course6034 = {
  course_id: '6-034-artificial-intelligence-fall-2010',
  title: 'Artificial Intelligence'
};

test('scoreNotebookCourseMatch: starkes Match bei Code + Titel', () => {
  const result = scoreNotebookCourseMatch(
    { title: 'MIT 6.034 — Artificial Intelligence', sources: [] },
    course6034
  );
  assert.ok(result.confidence >= 0.9, `confidence: ${result.confidence}`);
  assert.ok(result.reasons.some(reason => reason.startsWith('code:')));
  assert.ok(result.reasons.includes('title:exact'));
});

test('scoreNotebookCourseMatch: niedrige Confidence bei nur Title-Overlap', () => {
  const result = scoreNotebookCourseMatch(
    { title: 'Artificial Intelligence in Healthcare', sources: [] },
    course6034
  );
  // "Artificial Intelligence" Overlap auf 2/3 Words → strong/partial
  assert.ok(result.confidence < 0.6, `confidence: ${result.confidence}`);
});

test('scoreNotebookCourseMatch: Match über Source-Codes wenn Title generisch ist', () => {
  const result = scoreNotebookCourseMatch(
    {
      title: 'My AI Notebook',
      sources: [
        { title: 'MIT6_034 Lecture 1.pdf' },
        { title: 'MIT6_034 Lecture 2.pdf' },
        { title: 'MIT6_034 Lecture 3.pdf' }
      ]
    },
    course6034
  );
  assert.ok(result.reasons.some(reason => reason.startsWith('source-code:')));
  // Mit nur Source-Codes aber 3 Sources sollte Penalty nicht greifen
  assert.ok(!result.reasons.includes('too-few-sources'));
});

test('scoreNotebookCourseMatch: Penalty wenn nur Source-Code-Hit und <2 Sources', () => {
  const result = scoreNotebookCourseMatch(
    {
      title: 'Random Notebook Title',
      sources: [{ title: 'MIT6_034 Lecture 1.pdf' }]
    },
    course6034
  );
  assert.ok(result.reasons.includes('too-few-sources'));
  assert.ok(result.confidence <= 0.5);
});

test('matchNotebooksToCourses: liefert null-Course wenn Confidence < 0.55', () => {
  const result = matchNotebooksToCourses(
    [{ id: 'n1', title: 'Completely unrelated topic', sources: [] }],
    [course6034]
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].course, null);
  assert.equal(result[0].confidence, 0);
});

test('matchNotebooksToCourses: pickt das beste Course-Match pro Notebook', () => {
  const course2 = { course_id: '6-036-introduction-to-machine-learning-fall-2020', title: 'Introduction to Machine Learning' };
  const result = matchNotebooksToCourses(
    [{ id: 'n1', title: 'MIT 6.036 — Introduction to Machine Learning', sources: [] }],
    [course6034, course2]
  );
  assert.equal(result[0].course.course_id, course2.course_id);
});
