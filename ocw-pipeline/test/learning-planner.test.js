import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildLearningPathPlan,
  getLearnPlanOptions,
  saveLearningPathPlan
} from '../src/learning/planner.js';

test('getLearnPlanOptions: liest Materialpfad und begrenzt Units', () => {
  const options = getLearnPlanOptions(['--materials', 'materials.json', '--max-units', '99']);

  assert.equal(options.materialsPath, 'materials.json');
  assert.equal(options.maxUnits, 12);
});

test('buildLearningPathPlan: erzeugt Units mit required und optional sources', () => {
  const plan = buildLearningPathPlan({
    maxUnits: 2,
    screening: sampleScreening(),
    contract: {
      contract_id: 'contract-1',
      goal: 'Ich will AI Apps bauen',
      current_level: 'beginner',
      target_outcome: 'prototype',
      style: 'practical',
      language: 'de',
      preferred_materials: ['lecture videos', 'projects']
    }
  });

  assert.equal(plan.units.length, 2);
  assert.equal(plan.units[0].order, 1);
  assert.ok(plan.units[0].required_source_ids.length > 0);
  assert.ok(plan.sources.some(source => source.required));
  assert.ok(plan.markdown.includes('Learning Path'));
});

test('buildLearningPathPlan: bricht ohne planbare Units ab', () => {
  assert.throws(
    () => buildLearningPathPlan({
      screening: { course_material_overviews: [], usable_sources: [], gaps: [] },
      contract: { goal: 'x' }
    }),
    /keine Units/
  );
});

test('saveLearningPathPlan: schreibt JSON und Markdown mit gleichen Units', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-save-'));
  const plan = buildLearningPathPlan({
    maxUnits: 1,
    screening: sampleScreening(),
    contract: { contract_id: 'contract-1', goal: 'AI Apps', language: 'de' }
  });
  const paths = saveLearningPathPlan(plan, join(dir, 'learning-path.json'));

  const saved = JSON.parse(readFileSync(paths.jsonPath, 'utf8'));
  assert.equal(saved.units[0].unit_id, plan.units[0].unit_id);
  assert.ok(readFileSync(paths.markdownPath, 'utf8').includes(saved.units[0].title));
});

function sampleScreening() {
  return {
    contract_id: 'contract-1',
    candidate_courses: [{ course_id: 'course-a', title: 'Course A', score: 42 }],
    course_material_overviews: [
      {
        course_id: 'course-a',
        title: 'Course A',
        usable_sources: [
          {
            source_id: 'course-a:m1',
            material_id: 1,
            course_id: 'course-a',
            title: 'Lecture 1',
            material_type: 'Lecture Videos',
            media_type: 'youtube',
            upload_content: 'https://youtube.com/watch?v=abc',
            required_hint: true
          },
          {
            source_id: 'course-a:m2',
            material_id: 2,
            course_id: 'course-a',
            title: 'Problem Set 1',
            material_type: 'Problem Sets',
            media_type: 'pdf',
            upload_content: 'https://example.com/ps1.pdf',
            required_hint: true
          },
          {
            source_id: 'course-a:m3',
            material_id: 3,
            course_id: 'course-a',
            title: 'Optional Reading',
            material_type: 'Readings',
            media_type: 'pdf',
            upload_content: 'https://example.com/read.pdf',
            required_hint: false
          }
        ],
        gaps: [],
        units: [
          { unit_number: 1, title: 'Intro to Python', sources: [{ id: 1 }, { id: 2 }, { id: 3 }] },
          { unit_number: 2, title: 'Build an App', sources: [{ id: 2 }] }
        ]
      }
    ],
    usable_sources: [],
    gaps: []
  };
}
