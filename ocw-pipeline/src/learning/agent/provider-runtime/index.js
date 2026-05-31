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

export class ProviderValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProviderValidationError';
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
