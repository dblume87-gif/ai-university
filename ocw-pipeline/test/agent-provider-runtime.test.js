import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ProviderUnavailableError,
  ProviderValidationError,
  buildCodexExecArgs,
  buildCodexPrompt,
  buildCodexReviewOutputSchema,
  createCodexCliProvider,
  createDeterministicProvider,
  runCodexCliAuthSmoke,
  sanitizeCodexReviewResult,
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

test('createCodexCliProvider: bleibt ohne bestandenen Smoke gesperrt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-provider-gated-'));

  assert.throws(
    () => createCodexCliProvider({ smokePath: join(dir, 'missing-smoke.json') }),
    ProviderUnavailableError
  );
});

test('buildCodexExecArgs/buildCodexPrompt: nutzt Result-Datei und constraintes Task-Prompt', () => {
  const args = buildCodexExecArgs({
    cwd: 'ocw-pipeline',
    schemaPath: '/tmp/schema.json',
    resultPath: '/tmp/result.json'
  });
  const prompt = buildCodexPrompt({
    task: 'topic_fit',
    input: { candidate_courses: [] },
    schema: { type: 'object' }
  });

  assert.deepEqual(args.slice(0, 5), ['exec', '--cd', 'ocw-pipeline', '--sandbox', 'read-only']);
  assert.equal(args.includes('--ask-for-approval'), false);
  assert.ok(args.includes('--output-schema'));
  assert.ok(args.includes('--output-last-message'));
  assert.equal(args.at(-1), '-');
  const outputSchema = buildCodexReviewOutputSchema('topic_fit');
  assert.ok(outputSchema.properties.proposed_actions.items.required.includes('params'));
  assert.equal(outputSchema.properties.proposed_actions.items.properties.params.additionalProperties, false);
  assert.equal(outputSchema.properties.data.additionalProperties, false);
  assert.ok(outputSchema.properties.data.required.includes('verdicts'));
  assert.match(prompt, /liest keine Dateien/);
  assert.match(prompt, /broaden, refine, continue_anyway/);
  assert.match(prompt, /Parent-Topic/);
  assert.match(prompt, /accepted_candidate_ids/);
});

test('sanitizeCodexReviewResult: entfernt Actions ausserhalb der Task-Allowlist', () => {
  const result = sanitizeCodexReviewResult('coverage_review', {
    decision: 'ask_user',
    reasons: ['Needs work.'],
    default_action: 'broaden',
    proposed_actions: [
      { action: 'broaden', label: 'Breiter suchen', safe_default: true },
      { action: 'recover_sources', label: 'Deep Scan', params: {}, safe_default: true }
    ],
    data: {}
  });

  assert.equal(result.default_action, null);
  assert.deepEqual(result.proposed_actions.map(action => action.action), ['recover_sources']);
});

test('runCodexCliAuthSmoke/createCodexCliProvider: Fake-Smoke schaltet Adapter frei und liest Result-Datei', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-provider-smoke-'));
  const smokePath = join(dir, 'smoke.json');
  const calls = [];
  const smoke = await runCodexCliAuthSmoke({
    smokePath,
    tempRoot: dir,
    authMode: 'subscription',
    runner: async (args, context) => {
      calls.push({ args, prompt: context.prompt });
      writeFileSync(context.resultPath, JSON.stringify({
        status: 'passed',
        auth_mode: 'subscription',
        message: 'ok'
      }));
      return { stdout: '{"ignored":true}', stderr: '', exitCode: 0 };
    }
  });

  assert.equal(smoke.enabled, true);
  assert.equal(JSON.parse(readFileSync(smokePath, 'utf8')).status, 'passed');

  const provider = createCodexCliProvider({
    smokePath,
    tempRoot: dir,
    runner: async (args, context) => {
      calls.push({ args, prompt: context.prompt });
      writeFileSync(context.resultPath, JSON.stringify({
        decision: 'accepted',
        reasons: ['From result file.'],
        default_action: null,
        proposed_actions: [
          { action: 'broaden', label: 'Not allowed here', params: {}, safe_default: true }
        ],
        data: { source: 'result-file' }
      }));
      return { stdout: '{"decision":"stop"}', stderr: '', exitCode: 0 };
    }
  });
  const review = await provider.reviewJson({ task: 'goal_expansion', input: { goal: 'AI Apps' } });

  assert.equal(review.decision, 'accepted');
  assert.deepEqual(review.proposed_actions, []);
  assert.equal(review.data.source, 'result-file');
  assert.equal(review.metadata.provider, 'codex-cli');
  assert.equal(review.metadata.attempts, 1);
  assert.equal(calls.length, 2);
});
