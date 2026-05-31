import {
  appendFileSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { createHash } from 'crypto';

export function createAgentState(options = {}) {
  const runId = options.runId || options.run_id || `agent-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  return {
    run_id: runId,
    status: options.status || 'running',
    mode: options.mode || (options.liveNotebook ? 'live_notebook' : 'dry_run'),
    providers: options.providers || {
      agent: { adapter: 'deterministic' },
      notebook: { adapter: 'notebooklm' }
    },
    phase: options.phase || 'ziel_verstehen',
    inputs: options.inputs || {},
    steps: options.steps || {},
    conversation: {
      log_path: options.conversationPath || 'conversation.jsonl',
      last_turn_id: options.lastTurnId || null
    },
    handoffs: options.handoffs || {}
  };
}

export function getAgentStatePath(runDir) {
  return join(resolve(runDir), 'agent_state.json');
}

export function writeAgentState(runDir, state) {
  return atomicWriteJson(getAgentStatePath(runDir), state);
}

export function loadAgentState(runDirOrPath) {
  const path = String(runDirOrPath).endsWith('.json') ? resolve(runDirOrPath) : getAgentStatePath(runDirOrPath);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function atomicWriteJson(path, data) {
  return atomicWriteArtifact(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function atomicWriteArtifact(path, content) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  const tempPath = join(dirname(target), `.${basename(target)}.${process.pid}.${Date.now()}.tmp`);
  let fd = null;
  try {
    fd = openSync(tempPath, 'w');
    writeFileSync(fd, content, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(tempPath, target);
    fsyncDirectory(dirname(target));
  } catch (err) {
    if (fd !== null) closeSync(fd);
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only.
    }
    throw err;
  }
  return {
    artifact_path: target,
    artifact_sha256: sha256File(target)
  };
}

export function appendConversationTurn(logPath, turn) {
  const target = resolve(logPath);
  mkdirSync(dirname(target), { recursive: true });
  recoverPartialConversationLine(target);
  const normalized = {
    ...turn,
    turn_id: turn.turn_id || nextTurnId(target),
    created_at: turn.created_at || new Date().toISOString()
  };
  appendFileSync(target, `${JSON.stringify(normalized)}\n`, 'utf8');
  return normalized;
}

export function readConversationLog(logPath) {
  const target = resolve(logPath);
  if (!existsSync(target)) return [];
  const raw = readFileSync(target, 'utf8');
  const safeRaw = raw.endsWith('\n') ? raw : raw.slice(0, raw.lastIndexOf('\n') + 1);
  return safeRaw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function createInputFingerprint({
  stepName,
  stepVersion,
  taskPolicyVersion,
  inputs = {},
  dependencyHashes = {},
  providerSettings = {}
}) {
  return sha256Text(stableStringify({
    stepName,
    stepVersion,
    taskPolicyVersion,
    inputs,
    dependencyHashes,
    providerSettings
  }));
}

export function buildDependencyHashes(state, dependencyNames = []) {
  const hashes = {};
  for (const name of dependencyNames) {
    const hash = state.steps?.[name]?.accepted_output?.artifact_sha256;
    if (hash) hashes[name] = hash;
  }
  return hashes;
}

export function validateAcceptedStep(state, stepName, options = {}) {
  const step = state.steps?.[stepName];
  if (!step) return { valid: false, status: 'missing', reason: 'step_missing' };
  if (step.status !== 'accepted') return { valid: false, status: step.status, reason: 'step_not_accepted' };
  const output = step.accepted_output;
  if (!output?.artifact_path || !existsSync(output.artifact_path)) {
    return { valid: false, status: 'stale', reason: 'artifact_missing' };
  }
  const actualHash = sha256File(output.artifact_path);
  if (actualHash !== output.artifact_sha256) {
    return { valid: false, status: 'stale', reason: 'artifact_hash_mismatch', actualHash };
  }
  if (options.input_fingerprint && step.input_fingerprint !== options.input_fingerprint) {
    return { valid: false, status: 'stale', reason: 'input_fingerprint_mismatch' };
  }
  if (options.step_version && step.step_version !== options.step_version) {
    return { valid: false, status: 'stale', reason: 'step_version_mismatch' };
  }
  if (options.schema && output.schema !== options.schema) {
    return { valid: false, status: 'stale', reason: 'schema_mismatch' };
  }
  return { valid: true, status: 'accepted', reason: null, artifact: output };
}

export function markInvalidResumeSteps(state, validators = {}) {
  const nextState = structuredClone(state);
  for (const [stepName, validatorOptions] of Object.entries(validators)) {
    const result = validateAcceptedStep(nextState, stepName, validatorOptions);
    if (!result.valid && nextState.steps?.[stepName]) {
      nextState.steps[stepName].status = result.status === 'missing' ? 'stale' : result.status;
      nextState.steps[stepName].stale_reason = result.reason;
    }
  }
  return nextState;
}

export function renderAgentRunMarkdown(state) {
  const lines = [
    `# Agent Run: ${state.run_id}`,
    '',
    `Status: ${state.status}`,
    `Mode: ${state.mode}`,
    `Phase: ${state.phase}`,
    '',
    '## Steps',
    ''
  ];
  for (const [name, step] of Object.entries(state.steps || {})) {
    lines.push(`- ${name}: ${step.status}${step.accepted_output?.artifact_path ? ` (${step.accepted_output.artifact_path})` : ''}`);
    if (step.review?.decision) lines.push(`  Review: ${step.review.decision}`);
  }
  return `${lines.join('\n')}\n`;
}

export function writeAgentRunMarkdown(runDir, state) {
  return atomicWriteArtifact(join(resolve(runDir), 'AGENT_RUN.md'), renderAgentRunMarkdown(state));
}

export function sha256File(path) {
  return sha256Text(readFileSync(resolve(path)));
}

export function sha256Text(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function recoverPartialConversationLine(logPath) {
  if (!existsSync(logPath)) return;
  const raw = readFileSync(logPath, 'utf8');
  if (!raw || raw.endsWith('\n')) return;
  const lastNewline = raw.lastIndexOf('\n');
  writeFileSync(logPath, lastNewline >= 0 ? raw.slice(0, lastNewline + 1) : '', 'utf8');
}

function nextTurnId(logPath) {
  const turns = readConversationLog(logPath);
  return `turn_${String(turns.length + 1).padStart(4, '0')}`;
}

function fsyncDirectory(path) {
  let dirFd = null;
  try {
    dirFd = openSync(path, 'r');
    fsyncSync(dirFd);
  } catch {
    // Some platforms/filesystems do not permit directory fsync. File fsync + rename
    // still protects readers from partial file contents.
  } finally {
    if (dirFd !== null) closeSync(dirFd);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
