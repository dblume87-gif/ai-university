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

test('scoreNotebookCourseMatch: starkes Match über OCW Source-URL-Slug', () => {
  const course12740 = {
    course_id: '12-740-paleoceanography-spring-2008',
    title: 'Paleoceanography',
    source_url: 'https://ocw.mit.edu/courses/12-740-paleoceanography-spring-2008/'
  };
  const result = scoreNotebookCourseMatch(
    {
      title: 'Paleoceanography',
      sources: [
        {
          title: 'https://ocw.mit.edu/courses/12-740-paleoceanography-spring-2008/02f5d967ce637f066a1f68acf5e0bde0_lec01.pdf',
          url: 'https://ocw.mit.edu/courses/12-740-paleoceanography-spring-2008/02f5d967ce637f066a1f68acf5e0bde0_lec01.pdf'
        }
      ]
    },
    course12740
  );
  assert.ok(result.confidence >= 0.9, `confidence: ${result.confidence}`);
  assert.ok(result.reasons.includes('source-slug'));
});

test('scoreNotebookCourseMatch: Source-URLs ohne passenden Slug matchen nicht blind', () => {
  const result = scoreNotebookCourseMatch(
    {
      title: 'Paleoceanography',
      sources: [
        {
          title: 'https://example.com/other-course/lec01.pdf',
          url: 'https://example.com/other-course/lec01.pdf'
        }
      ]
    },
    course6034
  );
  assert.ok(!result.reasons.includes('source-slug'));
  assert.ok(result.confidence < 0.55, `confidence: ${result.confidence}`);
});

test('scoreNotebookCourseMatch: Course-Code matcht nicht als Prefix längerer Codes', () => {
  const course600 = {
    course_id: '6-00-introduction-to-computer-science-and-programming-fall-2008',
    title: 'Introduction to Computer Science and Programming'
  };
  const result = scoreNotebookCourseMatch(
    { title: 'MIT-6.0002 Computational Thinking and Data Science', sources: [] },
    course600
  );
  assert.ok(!result.reasons.some(reason => reason.startsWith('code:')));
});

test('scoreNotebookCourseMatch: Penalty bei nur Source-Slug-Hit und einzelner Quelle', () => {
  const course61200 = {
    course_id: '6-1200j-mathematics-for-computer-science-spring-2024',
    title: 'Mathematics for Computer Science'
  };
  const result = scoreNotebookCourseMatch(
    {
      title: 'Foundations of Logic: Predicates, Sets, and Mathematical Proofs',
      sources: [
        {
          title: 'https://ocw.mit.edu/courses/6-1200j-mathematics-for-computer-science-spring-2024/mit6_1200j_s24_lec01.pdf',
          url: 'https://ocw.mit.edu/courses/6-1200j-mathematics-for-computer-science-spring-2024/mit6_1200j_s24_lec01.pdf'
        }
      ]
    },
    course61200
  );
  assert.ok(result.reasons.includes('source-slug'));
  assert.ok(result.reasons.includes('too-few-sources'));
  assert.ok(result.confidence <= 0.5, `confidence: ${result.confidence}`);
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
