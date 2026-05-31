import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCourses } from '../src/tools/ocw-library.js';

test('searchCourses returns course evidence for strategy queries', () => {
  const result = searchCourses({
    query: 'Ich will Business Strategy lernen',
    limit: 5
  });

  assert.equal(result.no_candidates, false);
  assert.ok(result.courses.length > 0);
  assert.ok(result.courses.some(course => /strategy|strategic/i.test(course.title)));

  const course = result.courses[0];
  assert.equal(typeof course.course_id, 'string');
  assert.equal(typeof course.title, 'string');
  assert.ok(Array.isArray(course.topics));
  assert.equal(typeof course.material_evidence.total, 'number');
  assert.equal(course.material_evidence.from_metadata_unverified, true);
  assert.ok(Array.isArray(course.fit_evidence.matched_tokens));
  assert.equal(typeof course.fit_evidence.score, 'number');
  assert.match(course.source, /library\.db/);
});

test('searchCourses preserves weak generic evidence for agent judgment', () => {
  const result = searchCourses({
    query: 'business strategy analysis matrix',
    limit: 8
  });

  const weakTokens = result.courses.flatMap(course => course.fit_evidence.weak_signals.matched_tokens);
  assert.ok(weakTokens.includes('business'));
  assert.ok(weakTokens.some(token => ['analysis', 'matrix'].includes(token)));
  assert.ok(result.courses.some(course => course.fit_evidence.candidate_source === 'weak_signal_supplement'));
});

