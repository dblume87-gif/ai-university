import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAcceptedCandidateSelection,
  createQualityReviewProvider,
  reviewGoalExpansion,
  reviewTopicFit
} from '../src/learning/agent/quality-review/index.js';

test('reviewGoalExpansion: erweitert deutschen Kardiologie-Goal zu topic_terms und selector_terms', () => {
  const result = reviewGoalExpansion({
    goal: 'Kardiologie',
    language: 'de',
    current_level: 'beginner'
  });

  assert.equal(result.decision, 'accepted');
  assert.ok(result.data.domain_terms.includes('kardiologie'));
  assert.ok(result.data.topic_terms.includes('cardiology'));
  assert.ok(result.data.topic_terms.includes('cardiovascular'));
  assert.ok(result.data.selector_terms.includes('kardiologie'));
});

test('reviewGoalExpansion: unbekanntes Ein-Wort-Goal fragt User', () => {
  const result = reviewGoalExpansion({ goal: 'foo', language: 'de' });

  assert.equal(result.decision, 'ask_user');
  assert.equal(result.default_action, null);
});

test('reviewTopicFit: akzeptiert Kandidaten mit englischer Topic-Bestaetigung', () => {
  const result = reviewTopicFit({
    topic_terms: ['kardiologie', 'cardiology', 'cardiovascular'],
    candidate_courses: [
      candidate({
        course_id: 'hstm-cardiology',
        title: 'Cardiology Fundamentals',
        topics: ['Health Sciences', 'Cardiology'],
        matched_tokens: ['cardiology']
      })
    ]
  });

  assert.equal(result.decision, 'accepted');
  assert.deepEqual(result.data.accepted_candidate_ids, ['hstm-cardiology']);
  assert.equal(result.data.verdicts[0].verdict, 'accept');
});

test('reviewTopicFit: markiert Accounting-nur-im-Titel als low_confidence statt accepted', () => {
  const result = reviewTopicFit({
    topic_terms: ['accounting'],
    candidate_courses: [
      candidate({
        course_id: '11-481j-regional-growth',
        title: 'Analyzing and Accounting for Regional Economic Growth',
        topics: ['Economics', 'Urban Studies', 'Regional Planning'],
        matched_tokens: ['accounting'],
        score: 34
      })
    ]
  });

  assert.equal(result.decision, 'ask_user');
  assert.deepEqual(result.data.accepted_candidate_ids, []);
  assert.deepEqual(result.data.low_confidence_candidate_ids, ['11-481j-regional-growth']);
  assert.equal(result.data.verdicts[0].verdict, 'low_confidence');
  assert.equal(result.proposed_actions.find(action => action.action === 'continue_anyway').safe_default, false);
});

test('reviewTopicFit: gemischter Satz uebernimmt nur accept-Kandidaten', () => {
  const selection = {
    contract_id: 'contract-1',
    candidate_courses: [
      candidate({
        course_id: '15-511-financial-accounting',
        title: 'Financial Accounting',
        topics: ['Business', 'Accounting'],
        matched_tokens: ['accounting'],
        score: 42
      }),
      candidate({
        course_id: '11-481j-regional-growth',
        title: 'Analyzing and Accounting for Regional Economic Growth',
        topics: ['Economics', 'Urban Studies', 'Regional Planning'],
        matched_tokens: ['accounting'],
        score: 34
      })
    ]
  };
  const result = reviewTopicFit({
    topic_terms: ['accounting'],
    candidate_courses: selection.candidate_courses
  });
  const acceptedSelection = buildAcceptedCandidateSelection(selection, result.data);
  const continuedSelection = buildAcceptedCandidateSelection(selection, result.data, { includeLowConfidence: true });

  assert.equal(result.decision, 'accepted');
  assert.deepEqual(result.data.accepted_candidate_ids, ['15-511-financial-accounting']);
  assert.deepEqual(result.data.low_confidence_candidate_ids, ['11-481j-regional-growth']);
  assert.deepEqual(acceptedSelection.candidate_courses.map(item => item.course_id), ['15-511-financial-accounting']);
  assert.deepEqual(continuedSelection.candidate_courses.map(item => item.course_id), [
    '15-511-financial-accounting',
    '11-481j-regional-growth'
  ]);
});

test('createQualityReviewProvider: exposed handler results validate through provider-runtime', async () => {
  const provider = createQualityReviewProvider();
  const result = await provider.reviewJson({
    task: 'goal_expansion',
    input: { goal: 'Kardiologie', language: 'de' },
    schema: null
  });

  assert.equal(result.decision, 'accepted');
  assert.equal(result.metadata.provider, 'deterministic');
  assert.ok(result.data.topic_terms.includes('cardiology'));
});

function candidate({
  course_id,
  title,
  topics,
  matched_tokens,
  score = 24
}) {
  return {
    course_id,
    title,
    score,
    thematic_fit: {
      has_goal_match: matched_tokens.length > 0,
      matched_tokens,
      gate: matched_tokens.length > 0 ? 'passed' : 'filtered'
    },
    signals: {
      topics
    }
  };
}
