import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTier, TIER } from '../src/lib/schema.js';

test('calculateTier: ohne Lecture Materials → Tier 3 mit Score 0', () => {
  const result = calculateTier({ learning_resource_types: ['Readings'] }, null);
  assert.equal(result.tier, TIER.TIER_3);
  assert.equal(result.score, 0);
  assert.deepEqual(result.warnings, ['Keine Lecture Materials']);
});

test('calculateTier: Tier 1 für vollständigen Undergraduate-Kurs', () => {
  const data = {
    learning_resource_types: ['Lecture Notes', 'Lecture Videos', 'Problem Sets', 'Exams', 'Readings'],
    level: ['Undergraduate']
  };
  const contentMap = { a: '/foo/resources/a', b: '/foo/resources/b', c: '/foo/resources/c', d: '/foo/resources/d', e: '/foo/resources/e' };
  const result = calculateTier(data, contentMap);
  // 10+10+5+3+2 (Material) + 5 (Undergrad) + 10 (>=5 Resources) = 45 → Tier 1
  assert.equal(result.tier, TIER.TIER_1);
  assert.ok(result.score >= 35);
});

test('calculateTier: Tier 2 bei mittlerem Materialmix', () => {
  const data = {
    learning_resource_types: ['Lecture Videos', 'Problem Sets'],
    level: ['Graduate']
  };
  const contentMap = { a: '/foo/resources/a', b: '/foo/resources/b' };
  const result = calculateTier(data, contentMap);
  // 10 (Videos) + 5 (PSets) + 3 (Grad) + 5 (2 Resources) = 23 → Tier 2
  assert.equal(result.tier, TIER.TIER_2);
});

test('calculateTier: Course-Website-Signal kann fehlende OCW-Lecture-Types substituieren', () => {
  const data = { learning_resource_types: [] };
  const courseWebsite = { sessions: 12, slides: 5, videos: 5 };
  const result = calculateTier(data, null, courseWebsite);
  // slides>0 → Lecture Notes; videos>0 → Lecture Videos; passes Gate.
  assert.notEqual(result.tier, TIER.TIER_3);
  assert.ok(result.score >= 20);
});

test('calculateTier: warnt bei wenigen Sessions', () => {
  const data = { learning_resource_types: ['Lecture Notes'] };
  const courseWebsite = { sessions: 3, slides: 1, videos: 0 };
  const result = calculateTier(data, null, courseWebsite);
  assert.ok(result.warnings.some(warning => /Wenige Sessions/.test(warning)));
});
