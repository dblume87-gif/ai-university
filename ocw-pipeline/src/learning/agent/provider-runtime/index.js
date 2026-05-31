import { spawn } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const REVIEW_DECISIONS = Object.freeze(['accepted', 'retry', 'ask_user', 'stop']);

export const REVIEW_TASKS = Object.freeze([
  'goal_expansion',
  'topic_fit',
  'coverage_review',
  'plan_review'
]);

export const REVIEW_RESULT_SCHEMA = Object.freeze({
  required: ['decision', 'reasons', 'default_action', 'proposed_actions', 'data']
});

const REVIEW_DECISION_SET = new Set(REVIEW_DECISIONS);
const REVIEW_TASK_SET = new Set(REVIEW_TASKS);
const CODEX_PROVIDER_NAME = 'codex-cli';

const ALLOWED_ACTIONS_BY_TASK = Object.freeze({
  goal_expansion: [],
  topic_fit: ['broaden', 'refine', 'continue_anyway'],
  coverage_review: ['recover_sources', 'continue_anyway'],
  plan_review: ['normalize_titles', 'drop_unit', 'continue_anyway']
});

export class ProviderValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProviderValidationError';
    this.details = details;
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProviderUnavailableError';
    this.details = details;
  }
}

export function createDeterministicProvider({ handlers = {} } = {}) {
  return {
    name: 'deterministic',
    async reviewJson(request) {
      const started = Date.now();
      assertValidTask(request?.task);
      const handler = handlers[request.task] || defaultDeterministicHandler;
      const rawResult = await handler({
        task: request.task,
        input: request.input || {},
        schema: request.schema || REVIEW_RESULT_SCHEMA
      });
      const result = validateReviewResult(rawResult, {
        task: request.task,
        schema: request.schema || REVIEW_RESULT_SCHEMA
      });
      return withMetadata(result, {
        provider: 'deterministic',
        task: request.task,
        latency_ms: Date.now() - started,
        attempts: 1
      });
    }
  };
}

export function createCodexCliProvider(options = {}) {
  const smokePath = options.smokePath || getCodexCliSmokePath();
  const smoke = loadCodexCliSmoke(smokePath);
  if (!isCodexCliSmokePassed(smoke)) {
    throw new ProviderUnavailableError('Provider codex-cli ist gesperrt: Auth-Smoke fehlt oder ist nicht bestanden.', {
      smokePath
    });
  }

  return {
    name: CODEX_PROVIDER_NAME,
    async reviewJson(request) {
      return reviewJsonWithRepair({
        task: request?.task,
        input: request?.input || {},
        schema: request?.schema || REVIEW_RESULT_SCHEMA,
        providerName: CODEX_PROVIDER_NAME,
        execute: async ({ task, input, schema }) => runCodexCliReview({
          task,
          input,
          schema,
          runner: options.runner,
          cwd: options.cwd,
          tempRoot: options.tempRoot
        }),
        repair: async ({ task, input, schema, previous, error }) => runCodexCliReview({
          task,
          input,
          schema,
          previous,
          error,
          repair: true,
          runner: options.runner,
          cwd: options.cwd,
          tempRoot: options.tempRoot
        }),
        maxRepairAttempts: 1
      });
    }
  };
}

export async function runCodexCliAuthSmoke(options = {}) {
  const smokePath = options.smokePath || getCodexCliSmokePath();
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'auth_mode', 'message'],
    properties: {
      status: { type: 'string', enum: ['passed', 'failed'] },
      auth_mode: { type: 'string', enum: ['subscription', 'api_key', 'unknown'] },
      message: { type: 'string' }
    }
  };
  const prompt = [
    'Codex CLI auth smoke for AI University.',
    'Return only JSON matching the schema.',
    'Set status="passed" only if this headless codex exec is available and using local ChatGPT/Codex subscription auth.',
    'If auth mode is unclear, return status="failed" and auth_mode="unknown".'
  ].join('\n');

  let smoke;
  try {
    const result = await runCodexExec({
      prompt,
      schema,
      runner: options.runner,
      cwd: options.cwd,
      tempRoot: options.tempRoot
    });
    const parsed = readJsonFile(result.resultPath);
    smoke = {
      provider: CODEX_PROVIDER_NAME,
      status: parsed.status === 'passed' && parsed.auth_mode === 'subscription' ? 'passed' : 'failed',
      auth_mode: parsed.auth_mode || 'unknown',
      message: parsed.message || '',
      checked_at: new Date().toISOString(),
      command: result.command,
      result_path: result.resultPath,
      debug_log_path: result.debugLogPath
    };
  } catch (err) {
    smoke = {
      provider: CODEX_PROVIDER_NAME,
      status: 'failed',
      auth_mode: 'unknown',
      message: err.message,
      checked_at: new Date().toISOString()
    };
  }

  writeJsonFile(smokePath, smoke);
  return {
    smoke,
    smokePath,
    enabled: isCodexCliSmokePassed(smoke)
  };
}

export function isCodexCliProviderEnabled(options = {}) {
  return isCodexCliSmokePassed(loadCodexCliSmoke(options.smokePath || getCodexCliSmokePath()));
}

export function getCodexCliSmokePath() {
  return resolve(process.env.AIU_CODEX_CLI_SMOKE_PATH || join(__dirname, '../../../../output/agent-provider-smoke/codex-cli.json'));
}

export function buildCodexPrompt({ task, input = {}, schema = REVIEW_RESULT_SCHEMA, repair = false, previous = null, error = null }) {
  assertValidTask(task);
  const allowedActions = ALLOWED_ACTIONS_BY_TASK[task] || [];
  const taskInstructions = buildTaskInstructions(task);
  const sections = [
    'System:',
    'Du bewertest einen Pipeline-Output fuer einen Lernpfad-Agenten.',
    'Du fuehrst keine Aktionen aus, liest keine Dateien und verwendest nur die Input-Daten in diesem Prompt.',
    'Antworte ausschliesslich mit JSON nach dem Output-Schema.',
    '',
    `Task: ${task}`,
    `Erlaubte Actions fuer diese Task: ${allowedActions.join(', ') || '(keine)'}`,
    'Jede proposed_action muss safe_default boolean setzen.',
    'yes darf spaeter nur safe_default=true ausloesen; markiere riskante continue_anyway-Actions deshalb safe_default=false.',
    '',
    'Task-Anweisungen:',
    taskInstructions,
    '',
    'Output-Schema:',
    JSON.stringify(schema, null, 2),
    '',
    'Input:',
    JSON.stringify(input, null, 2)
  ];

  if (repair) {
    sections.push(
      '',
      'Repair-Hinweis:',
      'Die vorige Antwort war kein valides Review-JSON. Gib jetzt nur ein valides JSON-Objekt zurueck.',
      `Validierungsfehler: ${error?.message || 'unknown'}`,
      'Vorige Antwort:',
      JSON.stringify(previous, null, 2)
    );
  }

  return sections.join('\n');
}

function buildTaskInstructions(task) {
  if (task === 'goal_expansion') {
    return [
      '- Erweitere das Lernziel semantisch: Kernbegriffe, eng verwandte Suchbegriffe und sinnvolle deutsch/englische Uebersetzungen.',
      '- data muss domain_terms, synonyms, translations, topic_terms, selector_terms, language, level und exclusions enthalten.',
      '- selector_terms sind fuer die Course-Suche: waehle spezifische Begriffe, die gute Kurse finden, statt nur breite Parent-Kategorien.',
      '- Breite Parent-Kategorien duerfen als Kontext in topic_terms bleiben, sollen selector_terms aber nicht allein dominieren.',
      '- Wenn das Ziel fachlich zu unklar ist oder du keine spezifische Suchrichtung ableiten kannst, gib decision="ask_user" mit default_action=null zurueck.'
    ].join('\n');
  }

  if (task === 'topic_fit') {
    return [
      '- Bewerte jeden Kandidaten fachlich gegen das Lernziel, goal_expansion, Titel, Themenpfad, matched_tokens und Score.',
      '- Ein gemeinsamer grober Parent-Topic wie eine Department-/Fakultaets-Kategorie reicht nie allein fuer accept.',
      '- Akzeptiere nur Kandidaten, deren Titel oder Themenpfad plausibel zum spezifischen Lernziel passt.',
      '- Markiere plausible, aber schwach belegte Treffer als low_confidence; markiere Parent-only oder fachlich abwegige Treffer als reject.',
      '- data muss verdicts pro Kandidat, accepted_candidate_ids und low_confidence_candidate_ids enthalten.',
      '- Wenn es akzeptierte Kandidaten gibt, decision="accepted"; wenn nur unsichere Kandidaten bleiben, decision="ask_user" mit continue_anyway safe_default=false.'
    ].join('\n');
  }

  if (task === 'coverage_review') {
    return [
      '- Pruefe, ob akzeptierte Kurse genug nutzbare Quellen fuer einen Lernpfad haben.',
      '- Leere oder duenne Source-Coverage darf nicht still akzeptiert werden.',
      '- continue_anyway ist riskant und muss safe_default=false bleiben.'
    ].join('\n');
  }

  if (task === 'plan_review') {
    return [
      '- Pruefe, ob der Lernpfad fachlich konsistent ist, Units Quellen haben und keine rohen Dateinamen als Lerntitel durchrutschen.',
      '- Kurs-/Unit-Mismatches und quellenlose Units muessen als Flags in data erscheinen.',
      '- continue_anyway ist riskant und muss safe_default=false bleiben.'
    ].join('\n');
  }

  return '- Gib ein valides Review-JSON fuer diese Task zurueck.';
}

export function buildCodexReviewOutputSchema(task) {
  assertValidTask(task);
  const allowedActions = ALLOWED_ACTIONS_BY_TASK[task] || [];
  const actionNameSchema = allowedActions.length > 0
    ? { type: 'string', enum: allowedActions }
    : { type: 'string' };
  const defaultActionSchema = allowedActions.length > 0
    ? { anyOf: [{ type: 'string', enum: allowedActions }, { type: 'null' }] }
    : { anyOf: [{ type: 'string' }, { type: 'null' }] };

  return {
    type: 'object',
    additionalProperties: false,
    required: REVIEW_RESULT_SCHEMA.required,
    properties: {
      decision: { type: 'string', enum: REVIEW_DECISIONS },
      reasons: { type: 'array', items: { type: 'string' } },
      default_action: defaultActionSchema,
      proposed_actions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['action', 'label', 'safe_default'],
          properties: {
            action: actionNameSchema,
            label: { type: 'string' },
            params: { type: 'object' },
            safe_default: { type: 'boolean' }
          }
        }
      },
      data: {}
    }
  };
}

export function buildCodexExecArgs({ cwd = 'ocw-pipeline', schemaPath, resultPath } = {}) {
  return [
    'exec',
    '--cd', cwd,
    '--sandbox', 'read-only',
    '--ask-for-approval', 'never',
    '--ephemeral',
    '--output-schema', schemaPath,
    '--output-last-message', resultPath,
    '-'
  ];
}

export async function runCodexCliReview(options = {}) {
  const schema = buildCodexReviewOutputSchema(options.task);
  const prompt = buildCodexPrompt({
    task: options.task,
    input: options.input,
    schema,
    repair: options.repair,
    previous: options.previous,
    error: options.error
  });
  const result = await runCodexExec({
    prompt,
    schema,
    runner: options.runner,
    cwd: options.cwd,
    tempRoot: options.tempRoot
  });
  const raw = readJsonFile(result.resultPath);
  const sanitized = sanitizeCodexReviewResult(options.task, raw);
  cleanupCodexTempDir(result.resultPath);
  return sanitized;
}

function cleanupCodexTempDir(resultPath) {
  try {
    rmSync(dirname(resolve(resultPath)), { recursive: true, force: true });
  } catch {
    // Best-effort cleanup of the per-review temp dir; never fail a valid review on it.
  }
}

export async function runCodexExec({ prompt, schema, runner = runCodexProcess, cwd = 'ocw-pipeline', tempRoot = tmpdir() }) {
  const dir = mkdtempSync(join(resolve(tempRoot), 'codex-cli-review-'));
  const schemaPath = join(dir, 'schema.json');
  const resultPath = join(dir, 'result.json');
  const debugLogPath = join(dir, 'codex-debug.json');
  writeJsonFile(schemaPath, schema);
  const args = buildCodexExecArgs({ cwd, schemaPath, resultPath });
  const processResult = await runner(args, { prompt, schemaPath, resultPath, debugLogPath, cwd });
  writeJsonFile(debugLogPath, {
    command: ['codex', ...args],
    stdout: processResult?.stdout || '',
    stderr: processResult?.stderr || '',
    exitCode: processResult?.exitCode ?? 0
  });
  if (!existsSync(resultPath)) {
    throw new ProviderValidationError('codex-cli did not write the configured result file.', {
      resultPath
    });
  }
  return {
    command: ['codex', ...args],
    schemaPath,
    resultPath,
    debugLogPath
  };
}

export function sanitizeCodexReviewResult(task, raw) {
  assertValidTask(task);
  const allowedActions = new Set(ALLOWED_ACTIONS_BY_TASK[task] || []);
  const proposedActions = Array.isArray(raw?.proposed_actions)
    ? raw.proposed_actions.filter(action => allowedActions.has(action?.action))
    : [];
  const defaultAction = proposedActions.some(action => action.action === raw?.default_action)
    ? raw.default_action
    : null;
  return {
    decision: raw?.decision,
    reasons: raw?.reasons,
    default_action: defaultAction,
    proposed_actions: proposedActions,
    data: raw?.data ?? null
  };
}

export async function reviewJsonWithRepair({
  task,
  input = {},
  schema = REVIEW_RESULT_SCHEMA,
  providerName = 'provider',
  execute,
  repair,
  maxRepairAttempts = 1
}) {
  assertValidTask(task);
  if (typeof execute !== 'function') {
    throw new TypeError('reviewJsonWithRepair requires an execute function.');
  }
  const started = Date.now();
  let attempts = 0;
  let lastError = null;
  let lastRawResult = null;

  const attempt = async fn => {
    attempts += 1;
    lastRawResult = await fn({ task, input, schema, previous: lastRawResult, error: lastError });
    return validateReviewResult(lastRawResult, { task, schema });
  };

  try {
    const result = await attempt(execute);
    return withMetadata(result, {
      provider: providerName,
      task,
      latency_ms: Date.now() - started,
      attempts
    });
  } catch (err) {
    lastError = err;
  }

  if (typeof repair === 'function' && maxRepairAttempts > 0) {
    for (let index = 0; index < maxRepairAttempts; index++) {
      try {
        const result = await attempt(repair);
        return withMetadata(result, {
          provider: providerName,
          task,
          latency_ms: Date.now() - started,
          attempts
        });
      } catch (err) {
        lastError = err;
      }
    }
  }

  return withMetadata(providerFormatFallback(lastError), {
    provider: providerName,
    task,
    latency_ms: Date.now() - started,
    attempts
  });
}

export function validateReviewResult(result, { task = null, schema = REVIEW_RESULT_SCHEMA } = {}) {
  if (task !== null) assertValidTask(task);
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new ProviderValidationError('Provider result must be an object.');
  }

  const required = schema?.required || REVIEW_RESULT_SCHEMA.required;
  for (const key of required) {
    if (!(key in result)) {
      throw new ProviderValidationError(`Provider result is missing required field: ${key}.`, { field: key });
    }
  }

  if (!REVIEW_DECISION_SET.has(result.decision)) {
    throw new ProviderValidationError(`Invalid review decision: ${String(result.decision)}.`, {
      field: 'decision',
      value: result.decision
    });
  }
  if (!Array.isArray(result.reasons) || result.reasons.some(reason => typeof reason !== 'string')) {
    throw new ProviderValidationError('Provider result reasons must be an array of strings.', { field: 'reasons' });
  }
  if (!Array.isArray(result.proposed_actions)) {
    throw new ProviderValidationError('Provider result proposed_actions must be an array.', {
      field: 'proposed_actions'
    });
  }

  const actions = result.proposed_actions.map((action, index) => validateAction(action, index));
  const defaultAction = result.default_action ?? null;
  if (defaultAction !== null && typeof defaultAction !== 'string') {
    throw new ProviderValidationError('default_action must be a string or null.', { field: 'default_action' });
  }
  if (defaultAction !== null) {
    const match = actions.find(action => action.action === defaultAction);
    if (!match) {
      throw new ProviderValidationError('default_action must reference a proposed action.', {
        field: 'default_action',
        value: defaultAction
      });
    }
    if (!match.safe_default) {
      throw new ProviderValidationError('default_action must reference a safe_default action.', {
        field: 'default_action',
        value: defaultAction
      });
    }
  }

  return {
    decision: result.decision,
    reasons: [...result.reasons],
    default_action: defaultAction,
    proposed_actions: actions,
    data: result.data ?? null
  };
}

function assertValidTask(task) {
  if (!REVIEW_TASK_SET.has(task)) {
    throw new ProviderValidationError(`Invalid review task: ${String(task)}.`, { field: 'task', value: task });
  }
}

async function runCodexProcess(args, { prompt }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('codex', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', exitCode => {
      if (exitCode !== 0) {
        const err = new Error(`codex exec failed with exit code ${exitCode}.`);
        err.stdout = stdout;
        err.stderr = stderr;
        err.exitCode = exitCode;
        reject(err);
        return;
      }
      resolvePromise({ stdout, stderr, exitCode });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function loadCodexCliSmoke(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return readJsonFile(path);
  } catch {
    return null;
  }
}

function isCodexCliSmokePassed(smoke) {
  return smoke?.provider === CODEX_PROVIDER_NAME && smoke.status === 'passed' && smoke.auth_mode === 'subscription';
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writeJsonFile(path, data) {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return target;
}

function validateAction(action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    throw new ProviderValidationError(`proposed_actions[${index}] must be an object.`, {
      field: `proposed_actions[${index}]`
    });
  }
  if (typeof action.action !== 'string' || action.action.length === 0) {
    throw new ProviderValidationError(`proposed_actions[${index}].action must be a non-empty string.`, {
      field: `proposed_actions[${index}].action`
    });
  }
  if (typeof action.label !== 'string' || action.label.length === 0) {
    throw new ProviderValidationError(`proposed_actions[${index}].label must be a non-empty string.`, {
      field: `proposed_actions[${index}].label`
    });
  }
  if (typeof action.safe_default !== 'boolean') {
    throw new ProviderValidationError(`proposed_actions[${index}].safe_default must be boolean.`, {
      field: `proposed_actions[${index}].safe_default`
    });
  }
  if ('params' in action && (action.params === null || typeof action.params !== 'object' || Array.isArray(action.params))) {
    throw new ProviderValidationError(`proposed_actions[${index}].params must be an object when present.`, {
      field: `proposed_actions[${index}].params`
    });
  }
  return {
    action: action.action,
    label: action.label,
    params: action.params || {},
    safe_default: action.safe_default
  };
}

function defaultDeterministicHandler({ task }) {
  return {
    decision: 'accepted',
    reasons: [`No deterministic rule registered for ${task}; accepted by provider-runtime baseline.`],
    default_action: null,
    proposed_actions: [],
    data: null
  };
}

function providerFormatFallback(error) {
  return {
    decision: 'ask_user',
    reasons: [
      'The provider did not return valid structured review JSON.',
      error?.message || 'Unknown provider validation error.'
    ],
    default_action: null,
    proposed_actions: [],
    data: {
      provider_error: error?.name || 'ProviderValidationError'
    }
  };
}

function withMetadata(result, metadata) {
  return {
    ...result,
    metadata
  };
}
