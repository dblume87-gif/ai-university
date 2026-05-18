import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCourseSlugMetadata } from '../src/discovery/crawl.js';

test('parseCourseSlugMetadata: numeric course with term and year', () => {
  assert.deepEqual(
    parseCourseSlugMetadata('6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016'),
    { course_number: '6-0001', term: 'Fall', year: '2016' }
  );
});

test('parseCourseSlugMetadata: RES course number', () => {
  assert.deepEqual(
    parseCourseSlugMetadata('res-10-002-ethics-of-ai-bias-spring-2023'),
    { course_number: 'res-10-002', term: 'Spring', year: '2023' }
  );
});

test('parseCourseSlugMetadata: letter-prefixed special topic number', () => {
  assert.deepEqual(
    parseCourseSlugMetadata('mas-s60-how-to-ai-almost-anything-spring-2025'),
    { course_number: 'mas-s60', term: 'Spring', year: '2025' }
  );
});

test('parseCourseSlugMetadata: January IAP term', () => {
  assert.deepEqual(
    parseCourseSlugMetadata('6-s191-introduction-to-deep-learning-january-iap-2020'),
    { course_number: '6-s191', term: 'January IAP', year: '2020' }
  );
});

test('parseCourseSlugMetadata: slug without course number keeps available fields null', () => {
  assert.deepEqual(
    parseCourseSlugMetadata('introduction-to-r-and-gis-fall-2023'),
    { course_number: null, term: 'Fall', year: '2023' }
  );
});
