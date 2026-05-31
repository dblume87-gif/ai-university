import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  appendConversationTurn,
  atomicWriteJson,
  buildDependencyHashes,
  createAgentState,
  createInputFingerprint,
  loadAgentState,
  markInvalidResumeSteps,
  readConversationLog,
  sha256File,
  validateAcceptedStep,
  writeAgentRunMarkdown,
  writeAgentState
} from '../src/learning/agent/run-state/index.js';

test('createAgentState/writeAgentState: speichert Pointer-State ohne Verlauf', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-state-'));
  const state = createAgentState({
    runId: 'run-1',
    inputs: { goal: 'AI Apps' },
    lastTurnId: 'turn_0002'
  });
  const result = writeAgentState(dir, state);
  const loaded = loadAgentState(dir);

  assert.equal(loaded.run_id, 'run-1');
  assert.equal(loaded.conversation.last_turn_id, 'turn_0002');
  assert.ok(!('turns' in loaded));
  assert.equal(result.artifact_sha256, sha256File(result.artifact_path));
});

test('conversation.jsonl: append-only und partial-line recovery', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-conversation-'));
  const logPath = join(dir, 'conversation.jsonl');
  const first = appendConversationTurn(logPath, { role: 'user', phase: 'ziel_verstehen', text: 'Hallo' });
  const second = appendConversationTurn(logPath, { role: 'agent', phase: 'ziel_verstehen', text: 'Hi' });
  appendFileSync(logPath, '{"turn_id":"broken"', 'utf8');

  const turns = readConversationLog(logPath);

  assert.equal(first.turn_id, 'turn_0001');
  assert.equal(second.turn_id, 'turn_0002');
  assert.equal(turns.length, 2);
  assert.equal(turns[1].text, 'Hi');
});

test('validateAcceptedStep: akzeptiert nur gueltige Hashes und Fingerprints', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-step-'));
  const artifact = atomicWriteJson(join(dir, 'candidates.json'), { candidate_courses: [{ course_id: 'course-a' }] });
  const fingerprint = createInputFingerprint({
    stepName: 'course_discovery',
    stepVersion: 'course_discovery.v1',
    taskPolicyVersion: 'topic_fit.v1',
    inputs: { limit: 5 },
    dependencyHashes: { goal_expansion: 'sha256:abc' }
  });
  const state = createAgentState({
    steps: {
      course_discovery: {
        status: 'accepted',
        depends_on: ['learning_contract', 'goal_expansion'],
        step_version: 'course_discovery.v1',
        input_fingerprint: fingerprint,
        accepted_output: {
          artifact_path: artifact.artifact_path,
          artifact_sha256: artifact.artifact_sha256,
          schema: 'candidate_selection.v1',
          summary: { candidate_count: 1 }
        }
      }
    }
  });

  assert.equal(validateAcceptedStep(state, 'course_discovery', {
    input_fingerprint: fingerprint,
    step_version: 'course_discovery.v1',
    schema: 'candidate_selection.v1'
  }).valid, true);

  writeFileSync(artifact.artifact_path, '{"candidate_courses":[]}\n', 'utf8');
  const invalid = validateAcceptedStep(state, 'course_discovery', {
    input_fingerprint: fingerprint,
    step_version: 'course_discovery.v1',
    schema: 'candidate_selection.v1'
  });

  assert.equal(invalid.valid, false);
  assert.equal(invalid.reason, 'artifact_hash_mismatch');
});

test('fingerprint: goal_expansion Hash fliesst in course_discovery ein', () => {
  const state = createAgentState({
    steps: {
      learning_contract: {
        status: 'accepted',
        accepted_output: { artifact_sha256: 'sha256:contract' }
      },
      goal_expansion: {
        status: 'accepted',
        accepted_output: { artifact_sha256: 'sha256:goal-a' }
      }
    }
  });
  const dependencyHashes = buildDependencyHashes(state, ['learning_contract', 'goal_expansion']);
  const first = createInputFingerprint({
    stepName: 'course_discovery',
    stepVersion: 'course_discovery.v1',
    taskPolicyVersion: 'topic_fit.v1',
    dependencyHashes
  });
  const second = createInputFingerprint({
    stepName: 'course_discovery',
    stepVersion: 'course_discovery.v1',
    taskPolicyVersion: 'topic_fit.v1',
    dependencyHashes: { ...dependencyHashes, goal_expansion: 'sha256:goal-b' }
  });

  assert.deepEqual(Object.keys(dependencyHashes).sort(), ['goal_expansion', 'learning_contract']);
  assert.notEqual(first, second);
});

test('markInvalidResumeSteps: manipuliertes Artefakt wird stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-resume-'));
  const artifact = atomicWriteJson(join(dir, 'plan.json'), { units: [{ unit_id: 'u1' }] });
  const state = createAgentState({
    steps: {
      plan: {
        status: 'accepted',
        step_version: 'plan.v1',
        input_fingerprint: 'sha256:fingerprint',
        accepted_output: {
          artifact_path: artifact.artifact_path,
          artifact_sha256: artifact.artifact_sha256,
          schema: 'learning_path.v1',
          summary: { unit_count: 1 }
        }
      }
    }
  });
  writeFileSync(artifact.artifact_path, '{"units":[]}\n', 'utf8');

  const nextState = markInvalidResumeSteps(state, {
    plan: {
      input_fingerprint: 'sha256:fingerprint',
      step_version: 'plan.v1',
      schema: 'learning_path.v1'
    }
  });

  assert.equal(nextState.steps.plan.status, 'stale');
  assert.equal(nextState.steps.plan.stale_reason, 'artifact_hash_mismatch');
});

test('writeAgentRunMarkdown: schreibt lesbaren Run-Spiegel atomar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-run-md-'));
  const state = createAgentState({
    runId: 'run-md',
    steps: {
      goal_expansion: { status: 'accepted', review: { decision: 'accepted' } }
    }
  });
  const result = writeAgentRunMarkdown(dir, state);

  assert.ok(readFileSync(result.artifact_path, 'utf8').includes('Agent Run: run-md'));
  assert.equal(result.artifact_sha256, sha256File(result.artifact_path));
});
