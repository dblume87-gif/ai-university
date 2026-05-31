import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderValidationError,
  createDeterministicProvider,
  reviewJsonWithRepair,
  validateReviewResult
} from '../src/learning/agent/provider-runtime/index.js';

test('validateReviewResult: akzeptiert vollstaendige sichere Decision', () => {
  const result = validateReviewResult({
    decision: 'ask_user',
    reasons: ['Needs confirmation.'],
    default_action: 'recover_sources',
    proposed_actions: [
      {
        action: 'recover_sources',
        label: 'Deep Scan starten',
        params: { rescreenMissing: true },
        safe_default: true
      },
      {
        action: 'continue_anyway',
        label: 'Trotzdem fortfahren',
        params: {},
        safe_default: false
      }
    ],
    data: { coverage_ratio: 0.2 }
  }, { task: 'coverage_review' });

  assert.equal(result.decision, 'ask_user');
  assert.equal(result.default_action, 'recover_sources');
  assert.equal(result.proposed_actions[0].safe_default, true);
});

test('validateReviewResult: lehnt Action ohne safe_default ab', () => {
  assert.throws(
    () => validateReviewResult({
      decision: 'ask_user',
      reasons: ['Needs confirmation.'],
      default_action: null,
      proposed_actions: [
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {} }
      ],
      data: null
    }, { task: 'topic_fit' }),
    ProviderValidationError
  );
});

test('validateReviewResult: lehnt default_action auf unsichere Action ab', () => {
  assert.throws(
    () => validateReviewResult({
      decision: 'ask_user',
      reasons: ['Needs confirmation.'],
      default_action: 'continue_anyway',
      proposed_actions: [
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
      ],
      data: null
    }, { task: 'plan_review' }),
    /safe_default/
  );
});

test('validateReviewResult: default_action null ist gueltig ohne sichere Aktion', () => {
  const result = validateReviewResult({
    decision: 'ask_user',
    reasons: ['Please choose explicitly.'],
    default_action: null,
    proposed_actions: [
      { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
    ],
    data: null
  }, { task: 'topic_fit' });

  assert.equal(result.default_action, null);
});

test('createDeterministicProvider: liefert validierte Decision und Metadaten', async () => {
  const provider = createDeterministicProvider({
    handlers: {
      goal_expansion: () => ({
        decision: 'accepted',
        reasons: ['Expanded deterministically.'],
        default_action: null,
        proposed_actions: [],
        data: { topic_terms: ['accounting'] }
      })
    }
  });

  const result = await provider.reviewJson({ task: 'goal_expansion', input: {}, schema: null });

  assert.equal(result.decision, 'accepted');
  assert.equal(result.metadata.provider, 'deterministic');
  assert.equal(result.metadata.task, 'goal_expansion');
  assert.equal(result.metadata.attempts, 1);
  assert.equal(typeof result.metadata.latency_ms, 'number');
});

test('reviewJsonWithRepair: repariert hoechstens einmal und gibt dann Fallback ask_user', async () => {
  let repairCalls = 0;
  const result = await reviewJsonWithRepair({
    task: 'coverage_review',
    providerName: 'codex-cli',
    execute: async () => ({ decision: 'ask_user', reasons: [], default_action: null, proposed_actions: [{}], data: null }),
    repair: async () => {
      repairCalls += 1;
      return { decision: 'ask_user', reasons: [], default_action: 'continue_anyway', proposed_actions: [
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
      ], data: null };
    }
  });

  assert.equal(repairCalls, 1);
  assert.equal(result.decision, 'ask_user');
  assert.equal(result.metadata.provider, 'codex-cli');
  assert.equal(result.metadata.attempts, 2);
  assert.match(result.reasons.join(' '), /valid structured review JSON/);
});

test('reviewJsonWithRepair: akzeptiert repariertes valides Ergebnis', async () => {
  const result = await reviewJsonWithRepair({
    task: 'plan_review',
    providerName: 'codex-cli',
    execute: async () => ({ decision: 'ask_user', reasons: [], default_action: null, proposed_actions: [{}], data: null }),
    repair: async () => ({
      decision: 'accepted',
      reasons: ['Format repaired.'],
      default_action: null,
      proposed_actions: [],
      data: { repaired: true }
    })
  });

  assert.equal(result.decision, 'accepted');
  assert.deepEqual(result.data, { repaired: true });
  assert.equal(result.metadata.attempts, 2);
});
