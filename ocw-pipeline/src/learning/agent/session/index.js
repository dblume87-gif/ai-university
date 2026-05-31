import { existsSync, readFileSync } from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../../../lib/cli.js';
import {
  createCodexCliProvider,
  runCodexCliAuthSmoke
} from '../provider-runtime/index.js';
import { selectCourseCandidates } from '../../contract.js';
import { screenCandidateMaterials } from '../../material-screening.js';
import { buildLearningPathPlan } from '../../planner.js';
import { runPathNotebookWorkflow } from '../../path-notebook.js';
import {
  buildAcceptedCandidateSelection,
  createQualityReviewProvider,
  normalizeUnitTitle,
  reviewGoalExpansion
} from '../quality-review/index.js';
import {
  atomicWriteArtifact,
  atomicWriteJson,
  appendConversationTurn,
  createAgentState,
  createInputFingerprint,
  getAgentStatePath,
  loadAgentState,
  sha256Text,
  validateAcceptedStep,
  writeAgentRunMarkdown,
  writeAgentState
} from '../run-state/index.js';
import { renderReviewCard, saveReviewCard } from '../review-cards/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_ROOT = join(__dirname, '../../../../output/learning-paths');

const AGENT_SCHEMA = {
  stringFlags: [
    '--run',
    '--run-id',
    '--provider',
    '--goal',
    '--contract',
    '--current-level',
    '--time-budget',
    '--target-outcome',
    '--style',
    '--language',
    '--preferred-materials',
    '--out',
    '--db',
    '--units-root',
    '--smoke-path'
  ],
  intFlags: ['--limit', '--top', '--max-units', '--max-sources', '--timeout'],
  booleanFlags: ['--new', '--dry-run', '--live-notebook', '--force', '--help', '-h']
};

export const AGENT_PHASES = Object.freeze([
  'ziel_verstehen',
  'suchrichtung_festlegen',
  'kurse_waehlen',
  'quellen_pruefen',
  'lernpfad_bauen',
  'lernraum_vorbereiten',
  'loslernen',
  'weiterfuehren'
]);

const STEP_DEFINITIONS = Object.freeze([
  { name: 'learning_contract', phase: 'ziel_verstehen', schema: 'learning_contract.v1', version: 'learning_contract.v1' },
  { name: 'goal_expansion', phase: 'suchrichtung_festlegen', schema: 'goal_expansion.v1', version: 'goal_expansion.v1' },
  { name: 'course_discovery', phase: 'kurse_waehlen', schema: 'candidate_selection.v1', version: 'course_discovery.v1' },
  { name: 'source_coverage', phase: 'quellen_pruefen', schema: 'material_screening.v1', version: 'source_coverage.v1' },
  { name: 'learning_path', phase: 'lernpfad_bauen', schema: 'learning_path.v1', version: 'learning_path.v1' },
  { name: 'notebook_readiness', phase: 'lernraum_vorbereiten', schema: 'notebook_state.v1', version: 'notebook_readiness.v1' }
]);

const STEP_BY_NAME = new Map(STEP_DEFINITIONS.map(step => [step.name, step]));
const DEFAULT_RETRY_BUDGET = 2;
const FREE_TEXT_PHASES = new Set(['ziel_verstehen', 'suchrichtung_festlegen']);
const ACTION_ALIASES = new Map([
  ['broaden', 'broaden'],
  ['breiter suchen', 'broaden'],
  ['deep scan', 'recover_sources'],
  ['recover sources', 'recover_sources'],
  ['quellen suchen', 'recover_sources'],
  ['continue anyway', 'continue_anyway'],
  ['trotzdem fortfahren', 'continue_anyway'],
  ['skip notebook', 'skip_notebook'],
  ['notebook ueberspringen', 'skip_notebook'],
  ['normalize titles', 'normalize_titles'],
  ['titel normalisieren', 'normalize_titles'],
  ['drop unit', 'drop_unit'],
  ['refine', 'refine'],
  ['ziel schaerfen', 'refine']
]);

const BROADENED_SELECTOR_TERMS = Object.freeze({
  kardiologie: ['medicine', 'health', 'biology', 'physiology'],
  cardiology: ['medicine', 'health', 'biology', 'physiology'],
  accounting: ['finance', 'management', 'business'],
  buchhaltung: ['finance', 'management', 'business']
});

export function getAgentSessionOptions(args) {
  const parsed = parseCliArgs(args, AGENT_SCHEMA);
  const action = parsed.positional[0] || 'chat';
  const goalFromPositionals = action === 'chat' || action === 'status'
    ? parsed.positional.slice(1).join(' ')
    : parsed.positional.join(' ');

  return {
    action,
    newRun: parsed.has('--new'),
    runId: parsed.getString('--run', parsed.getString('--run-id', null)),
    provider: parsed.getString('--provider', 'deterministic'),
    smokePath: parsed.getString('--smoke-path', null),
    goal: parsed.getString('--goal') || goalFromPositionals,
    contractPath: parsed.getString('--contract', null),
    currentLevel: parsed.getString('--current-level', null),
    timeBudget: parsed.getString('--time-budget', null),
    targetOutcome: parsed.getString('--target-outcome', null),
    style: parsed.getString('--style', null),
    language: parsed.getString('--language', null),
    preferredMaterials: parsed.getList('--preferred-materials', null),
    outDir: parsed.getString('--out', null),
    dbPath: parsed.getString('--db', null),
    unitsRoot: parsed.getString('--units-root', null),
    limit: Math.min(parsed.getPositiveInt('--limit', 5), 5),
    top: Math.min(parsed.getPositiveInt('--top', 5), 5),
    maxUnits: Math.min(parsed.getPositiveInt('--max-units', 12), 12),
    maxSources: Math.min(parsed.getPositiveInt('--max-sources', 60), 60),
    timeout: parsed.getPositiveInt('--timeout', 180),
    dryRun: parsed.has('--live-notebook') ? false : true,
    liveNotebook: parsed.has('--live-notebook'),
    force: parsed.has('--force'),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export async function runInteractiveAgentChat(options, dependencies = {}) {
  const readlineFactory = dependencies.createReadline || createInterface;
  const rl = readlineFactory({ input, output });
  try {
    return await runAgentChat(options, {
      ...dependencies,
      question: prompt => rl.question(prompt)
    });
  } finally {
    rl.close();
  }
}

export async function runAgentChat(options = {}, dependencies = {}) {
  const context = initializeContext(options, dependencies);
  announceRun(context);

  while (context.state.status === 'running' || context.state.status === 'waiting_for_user') {
    if (context.state.status === 'running') {
      await advanceAgent(context);
      continue;
    }

    if (typeof context.question !== 'function') break;
    const answer = await context.question('Du: ');
    await handleAgentInput(context, answer);
  }

  persistState(context);
  return buildSessionResult(context);
}

export function runAgentStatus(options = {}) {
  const runDir = resolveExistingRunDir(options);
  const state = loadAgentState(runDir);
  return {
    runDir,
    state,
    statePath: getAgentStatePath(runDir)
  };
}

export async function runAgentProviderSmoke(options = {}, dependencies = {}) {
  const provider = options.provider || 'codex-cli';
  if (provider !== 'codex-cli') {
    throw new Error(`Kein Smoke fuer Provider ${provider} verfuegbar.`);
  }
  return runCodexCliAuthSmoke({
    smokePath: options.smokePath || null,
    runner: dependencies.runner,
    cwd: dependencies.cwd,
    tempRoot: dependencies.tempRoot
  });
}

export function printAgentProviderSmoke(result, logger = console) {
  logger.log('\n=== Agent Provider Smoke ===\n');
  logger.log(`Provider: ${result.smoke.provider}`);
  logger.log(`Status: ${result.smoke.status}`);
  logger.log(`Auth: ${result.smoke.auth_mode}`);
  logger.log(`Enabled: ${result.enabled ? 'yes' : 'no'}`);
  logger.log(`Path: ${result.smokePath}`);
  if (result.smoke.message) logger.log(`Message: ${result.smoke.message}`);
}

export function printAgentStatus(result, logger = console) {
  logger.log('\n=== Agent Run ===\n');
  logger.log(`Run: ${result.state.run_id}`);
  logger.log(`Status: ${result.state.status}`);
  logger.log(`Mode: ${result.state.mode}`);
  logger.log(`Phase: ${result.state.phase}`);
  logger.log(`Dir: ${result.runDir}`);
  logger.log(`State: ${result.statePath}`);
  if (result.state.active_card?.card_path) logger.log(`Card: ${result.state.active_card.card_path}`);
}

export function dispatchActiveCardInput(input, activeCard) {
  const text = normalizeCommand(input);
  if (!text) return { type: 'empty' };
  if (text === 'status') return { type: 'status' };
  if (text === 'quit' || text === 'exit') return { type: 'quit' };

  const review = activeCard?.review || {};
  const proposedActions = review.proposed_actions || [];

  if (text === 'yes') {
    if (!review.default_action) {
      return { type: 'unavailable', message: 'yes ist nur verfuegbar, wenn die offene Card eine sichere Default-Aktion anbietet.' };
    }
    const action = proposedActions.find(item => item.action === review.default_action);
    if (!action?.safe_default) {
      return { type: 'unavailable', message: 'yes kann keine riskante Aktion ausloesen.' };
    }
    return { type: 'action', action: action.action, actionSpec: action, via: 'yes' };
  }

  const actionName = ACTION_ALIASES.get(text) || text.replaceAll(' ', '_');
  const action = proposedActions.find(item => item.action === actionName);
  if (!action) {
    return {
      type: 'unavailable',
      message: `"${input}" ist fuer diese Card nicht verfuegbar. Nutze eine der angebotenen Aktionen.`
    };
  }

  return { type: 'action', action: action.action, actionSpec: action, via: 'explicit' };
}

export async function handleAgentInput(context, input) {
  const text = String(input || '').trim();
  if (!text) return null;

  const userTurn = appendConversationTurn(join(context.runDir, context.state.conversation.log_path), {
    role: 'user',
    phase: context.state.phase,
    text
  });
  context.state.conversation.last_turn_id = userTurn.turn_id;

  if (context.state.active_card) {
    const dispatch = dispatchActiveCardInput(text, context.state.active_card);
    if (dispatch.type === 'status') {
      logStatusLine(context);
      persistState(context);
      return dispatch;
    }
    if (dispatch.type === 'quit') {
      context.state.status = 'stopped';
      context.state.completed_at = new Date().toISOString();
      context.state.active_card = null;
      appendAgentTurn(context, 'Run gestoppt.');
      persistState(context);
      return dispatch;
    }
    if (dispatch.type === 'unavailable') {
      appendAgentTurn(context, dispatch.message);
      context.logger.log(dispatch.message);
      persistState(context);
      return dispatch;
    }
    await applyCardAction(context, dispatch);
    if (context.state.status === 'running') {
      while (context.state.status === 'running') {
        await advanceAgent(context);
        if (context.state.status !== 'waiting_for_user') continue;
        break;
      }
    }
    persistState(context);
    return dispatch;
  }

  const command = normalizeCommand(text);
  if (command === 'status') {
    logStatusLine(context);
    persistState(context);
    return { type: 'status' };
  }
  if (command === 'quit' || command === 'exit') {
    context.state.status = 'stopped';
    context.state.completed_at = new Date().toISOString();
    appendAgentTurn(context, 'Run gestoppt.');
    persistState(context);
    return { type: 'quit' };
  }

  if (FREE_TEXT_PHASES.has(context.state.phase) || context.state.status === 'waiting_for_user') {
    acceptRefinedGoal(context, text);
    while (context.state.status === 'running') {
      await advanceAgent(context);
      if (context.state.status !== 'waiting_for_user') continue;
      break;
    }
    persistState(context);
    return { type: 'free_text', field: 'goal' };
  }

  appendAgentTurn(context, 'Ich habe gerade keine offene Card. Nutze status oder quit.');
  persistState(context);
  return { type: 'ignored' };
}

function initializeContext(options, dependencies) {
  const runDir = resolveRunDir(options);
  const state = options.newRun || !existsSync(getAgentStatePath(runDir))
    ? createInitialState(options, runDir)
    : prepareResumeState(loadAgentState(runDir));

  const context = {
    options,
    runDir,
    state,
    logger: dependencies.logger || console,
    question: dependencies.question || null,
    provider: dependencies.provider || createProvider(options.provider || state.providers?.agent?.adapter, options),
    notebookRunner: dependencies.notebookRunner,
    rescreener: dependencies.rescreener,
    unitExporter: dependencies.unitExporter
  };

  persistState(context);
  return context;
}

function createInitialState(options, runDir) {
  const runId = options.runId || buildRunId(options.goal || 'agent-run');
  const state = createAgentState({
    runId,
    mode: options.liveNotebook ? 'live_notebook' : 'dry_run',
    providers: {
      agent: { adapter: options.provider || 'deterministic' },
      notebook: { adapter: 'notebooklm' }
    },
    phase: 'ziel_verstehen',
    inputs: {
      goal: options.goal || null,
      contract_path: options.contractPath || null,
      db_path: options.dbPath || null,
      units_root: options.unitsRoot || null,
      current_level: options.currentLevel || null,
      time_budget: options.timeBudget || null,
      target_outcome: options.targetOutcome || null,
      style: options.style || null,
      language: options.language || null,
      preferred_materials: options.preferredMaterials || null,
      limit: options.limit || 5,
      top: options.top || 5,
      max_units: options.maxUnits || 12,
      max_sources: options.maxSources || 60,
      timeout: options.timeout || 180
    }
  });
  state.run_dir = runDir;
  state.created_at = new Date().toISOString();
  state.updated_at = state.created_at;
  state.retry_budget = {};
  return state;
}

function createProvider(providerName, options = {}) {
  if (!providerName || providerName === 'deterministic') return createQualityReviewProvider();
  if (providerName === 'codex-cli') return createCodexCliProvider({ smokePath: options.smokePath || null });
  throw new Error(`Unbekannter Agent-Provider: ${providerName}`);
}

function prepareResumeState(state) {
  const nextState = structuredClone(state);
  const staleIndex = STEP_DEFINITIONS.findIndex(step => {
    if (nextState.steps?.[step.name]?.status !== 'accepted') return false;
    const result = validateAcceptedStep(nextState, step.name, {
      step_version: step.version,
      schema: step.schema
    });
    if (result.valid) return false;
    nextState.steps[step.name].status = 'stale';
    nextState.steps[step.name].stale_reason = result.reason;
    nextState.resume_events = [
      ...(nextState.resume_events || []),
      {
        step: step.name,
        reason: result.reason,
        detected_at: new Date().toISOString()
      }
    ];
    return true;
  });

  if (staleIndex < 0) return nextState;

  for (const step of STEP_DEFINITIONS.slice(staleIndex + 1)) {
    delete nextState.steps[step.name];
  }
  nextState.status = 'running';
  nextState.active_card = null;
  nextState.phase = STEP_DEFINITIONS[staleIndex].phase;
  return nextState;
}

async function advanceAgent(context) {
  if (!isStepAccepted(context.state, 'learning_contract')) return runLearningContractStep(context);
  if (!isStepAccepted(context.state, 'goal_expansion')) return runGoalExpansionStep(context);
  if (!isStepAccepted(context.state, 'course_discovery')) return runCourseDiscoveryStep(context);
  if (!isStepAccepted(context.state, 'source_coverage')) return runSourceCoverageStep(context);
  if (!isStepAccepted(context.state, 'learning_path')) return runLearningPathStep(context);
  if (!isStepAccepted(context.state, 'notebook_readiness')) return runNotebookReadinessStep(context);

  context.state.phase = 'loslernen';
  context.state.status = 'completed';
  context.state.completed_at = new Date().toISOString();
  context.state.handoffs.chat = {
    status: 'ready_for_unit_source_routing'
  };
  appendAgentTurn(context, 'Dry-Run ist fertig. Der Lernpfad und der vorbereitete Lernraum liegen im Run-Ordner.');
  persistState(context);
}

function runLearningContractStep(context) {
  const step = STEP_BY_NAME.get('learning_contract');
  context.state.phase = step.phase;
  beginStep(context, step);

  try {
    const contract = normalizeAgentLearningContract(context.state.inputs, context.state.run_id);
    const output = atomicWriteJson(join(context.runDir, 'learning-contract.json'), contract);
    acceptStep(context, step, output, {
      decision: 'accepted',
      reasons: ['Learning Contract wurde normalisiert.'],
      default_action: null,
      proposed_actions: [],
      data: { goal: contract.goal }
    }, { goal: contract.goal });
  } catch (err) {
    waitForUser(context, step, {
      decision: 'ask_user',
      reasons: [err.message || 'Bitte beschreibe dein Lernziel konkreter.'],
      default_action: null,
      proposed_actions: [],
      data: { field: 'goal' }
    }, {
      searched: 'ein konkretes Lernziel',
      found: 'noch nicht genug Kontext'
    });
  }
}

async function runGoalExpansionStep(context) {
  const step = STEP_BY_NAME.get('goal_expansion');
  const contract = loadAcceptedJson(context, 'learning_contract');
  context.state.phase = step.phase;
  beginStep(context, step, ['learning_contract']);

  const review = await reviewWithProvider(context, 'goal_expansion', {
    normalized_contract: contract
  });
  const output = atomicWriteJson(join(context.runDir, 'goal-expansion.json'), review.data);

  if (review.decision === 'accepted') {
    acceptStep(context, step, output, review, {
      selector_terms: review.data?.selector_terms || []
    });
    return;
  }

  setDraftOutput(context, step, output, review);
  waitForUser(context, step, review, {
    searched: contract.goal,
    found: summarizeTerms(review.data?.selector_terms || [])
  });
}

async function runCourseDiscoveryStep(context) {
  const step = STEP_BY_NAME.get('course_discovery');
  const contract = loadAcceptedJson(context, 'learning_contract');
  const expansion = loadAcceptedJson(context, 'goal_expansion');
  const selectorTerms = buildSelectorTermsForRun(context, expansion);
  context.state.phase = step.phase;
  beginStep(context, step, ['learning_contract', 'goal_expansion']);

  const rawSelection = selectCourseCandidates({
    contract,
    dbPath: context.state.inputs.db_path || context.options.dbPath,
    limit: context.state.inputs.limit || 5,
    selector_terms: selectorTerms
  });
  const rawOutput = atomicWriteJson(join(context.runDir, 'candidates.raw.json'), rawSelection);
  const review = await reviewWithProvider(context, 'topic_fit', {
    selection: rawSelection,
    goal_expansion: expansion,
    topic_terms: expansion.topic_terms || []
  });

  if (review.decision === 'accepted') {
    const acceptedSelection = buildAcceptedCandidateSelection(rawSelection, review.data);
    const output = atomicWriteJson(join(context.runDir, 'candidates.json'), acceptedSelection);
    acceptStep(context, step, output, review, {
      raw_candidate_count: rawSelection.candidate_courses.length,
      candidate_count: acceptedSelection.candidate_courses.length
    });
    context.state.steps[step.name].raw_output = rawOutput;
    return;
  }

  setDraftOutput(context, step, rawOutput, review);
  waitForUser(context, step, review, {
    searched: summarizeTerms(selectorTerms),
    found: rawSelection.candidate_courses.length > 0
      ? `${rawSelection.candidate_courses.length} Kandidat(en), aber keine sichere Freigabe`
      : 'keine passenden Kandidaten'
  });
}

async function runSourceCoverageStep(context) {
  const step = STEP_BY_NAME.get('source_coverage');
  const contract = loadAcceptedJson(context, 'learning_contract');
  const candidateSelection = loadAcceptedJson(context, 'course_discovery');
  const override = consumeActionParams(context, step.name);
  context.state.phase = step.phase;
  beginStep(context, step, ['course_discovery']);

  const screening = await screenCandidateMaterials({
    candidateSelection,
    contract,
    dbPath: context.state.inputs.db_path || context.options.dbPath,
    unitsRoot: context.state.inputs.units_root || context.options.unitsRoot,
    rescreenMissing: override.rescreenMissing === true,
    exportMissingUnits: override.exportMissingUnits === true,
    rescreener: context.rescreener,
    unitExporter: context.unitExporter,
    top: context.state.inputs.top || 5
  });
  const draftOutput = atomicWriteJson(join(context.runDir, 'material-screening.raw.json'), screening);
  const review = await reviewWithProvider(context, 'coverage_review', screening);

  if (review.decision === 'accepted') {
    const output = atomicWriteJson(join(context.runDir, 'material-screening.json'), screening);
    acceptStep(context, step, output, review, {
      course_count: screening.course_material_overviews.length,
      usable_sources: screening.usable_sources.length
    });
    context.state.steps[step.name].raw_output = draftOutput;
    return;
  }

  setDraftOutput(context, step, draftOutput, review);
  waitForUser(context, step, review, {
    searched: `${candidateSelection.candidate_courses?.length || 0} akzeptierte Kurse`,
    found: `${screening.usable_sources.length} nutzbare Quellen`
  });
}

async function runLearningPathStep(context) {
  const step = STEP_BY_NAME.get('learning_path');
  const contract = loadAcceptedJson(context, 'learning_contract');
  const screening = loadAcceptedJson(context, 'source_coverage');
  context.state.phase = step.phase;
  beginStep(context, step, ['learning_contract', 'source_coverage']);

  const plan = buildLearningPathPlan({
    screening,
    contract,
    maxUnits: context.state.inputs.max_units || 12,
    pathId: context.state.run_id
  });
  const draftOutput = writePlanArtifacts(context.runDir, plan, 'learning-path.draft');
  const review = await reviewWithProvider(context, 'plan_review', { plan });

  if (review.decision === 'accepted') {
    const output = writePlanArtifacts(context.runDir, plan, 'learning-path');
    acceptStep(context, step, output.json, review, {
      markdown_path: output.markdown.artifact_path,
      unit_count: plan.units.length,
      source_count: plan.sources.length
    });
    context.state.steps[step.name].markdown_output = output.markdown;
    context.state.steps[step.name].draft_output = draftOutput.json;
    return;
  }

  setDraftOutput(context, step, draftOutput.json, review);
  context.state.steps[step.name].draft_markdown_output = draftOutput.markdown;
  waitForUser(context, step, review, {
    searched: 'einen zitierbaren Lernpfad',
    found: `${review.data?.flags?.length || 0} Qualitaets-Flag(s)`
  });
}

async function runNotebookReadinessStep(context) {
  const step = STEP_BY_NAME.get('notebook_readiness');
  const plan = loadAcceptedJson(context, 'learning_path');
  context.state.phase = step.phase;
  beginStep(context, step, ['learning_path']);

  const result = await runPathNotebookWorkflow({
    plan,
    statePath: join(context.runDir, 'path-notebook-state.json'),
    create: true,
    wait: true,
    dryRun: context.state.mode !== 'live_notebook',
    maxSources: context.state.inputs.max_sources || 60,
    timeout: context.state.inputs.timeout || 180
  }, context.notebookRunner);

  const review = reviewNotebookReadiness(result.state, context.state.mode);
  if (review.decision === 'accepted') {
    const output = {
      artifact_path: result.statePath,
      artifact_sha256: sha256Text(readFileSync(result.statePath)),
      schema: step.schema
    };
    acceptStep(context, step, output, review, {
      notebook_status: result.state.status,
      source_count: result.state.sources.length
    });
    context.state.handoffs.notebook = {
      status: result.state.status,
      notebook_id: result.state.notebook?.notebook_id || null
    };
    return;
  }

  const output = {
    artifact_path: result.statePath,
    artifact_sha256: sha256Text(readFileSync(result.statePath)),
    schema: step.schema
  };
  setDraftOutput(context, step, output, review);
  waitForUser(context, step, review, {
    searched: 'vorbereitete Notebook-Quellen',
    found: result.state.status
  });
}

async function applyCardAction(context, dispatch) {
  const activeCard = context.state.active_card;
  const stepName = activeCard.step;
  const action = dispatch.action;
  const params = dispatch.actionSpec?.params || {};

  appendAgentTurn(context, `Aktion angenommen: ${action}`);

  if (action === 'refine') {
    clearActiveCard(context);
    context.state.phase = 'ziel_verstehen';
    context.state.status = 'waiting_for_user';
    context.state.steps.learning_contract = {
      status: 'waiting_for_user',
      phase: 'ziel_verstehen',
      review: {
        decision: 'ask_user',
        reasons: ['Bitte gib ein schaerferes Lernziel ein.'],
        default_action: null,
        proposed_actions: [],
        data: { field: 'goal' }
      }
    };
    appendAgentTurn(context, 'Bitte gib ein schaerferes Lernziel ein.');
    return;
  }

  if (action === 'broaden' && stepName === 'course_discovery') {
    approveRetry(context, stepName, { broaden: true, ...params });
    return;
  }

  if (action === 'recover_sources' && stepName === 'source_coverage') {
    approveRetry(context, stepName, { rescreenMissing: true, exportMissingUnits: true, ...params });
    return;
  }

  if (action === 'continue_anyway') {
    applyContinueAnyway(context, stepName);
    return;
  }

  if (action === 'normalize_titles' && stepName === 'learning_path') {
    applyNormalizeTitles(context);
    return;
  }

  if (action === 'drop_unit' && stepName === 'learning_path') {
    applyDropFlaggedUnits(context);
    return;
  }

  if (action === 'skip_notebook' && stepName === 'notebook_readiness') {
    applySkipNotebook(context);
    return;
  }

  appendAgentTurn(context, `Aktion ${action} ist hier noch nicht umgesetzt.`);
}

function approveRetry(context, stepName, params = {}) {
  const remaining = getRetryBudget(context, stepName);
  if (remaining <= 0) {
    appendAgentTurn(context, 'Retry-Budget fuer diesen Schritt ist aufgebraucht.');
    context.state.status = 'waiting_for_user';
    return;
  }
  context.state.retry_budget[stepName] = remaining - 1;
  context.state.action_params = {
    ...(context.state.action_params || {}),
    [stepName]: params
  };
  resetStep(context, stepName);
  clearActiveCard(context);
  context.state.status = 'running';
}

function applyContinueAnyway(context, stepName) {
  if (stepName === 'course_discovery') {
    const rawSelection = readJson(context.state.steps[stepName].draft_output.artifact_path);
    const review = context.state.steps[stepName].review;
    const acceptedSelection = buildAcceptedCandidateSelection(rawSelection, review.data, { includeLowConfidence: true });
    const output = atomicWriteJson(join(context.runDir, 'candidates.json'), acceptedSelection);
    acceptStep(context, STEP_BY_NAME.get(stepName), output, review, {
      candidate_count: acceptedSelection.candidate_courses.length,
      continued_low_confidence: true
    });
    context.state.steps[stepName].raw_output = context.state.steps[stepName].draft_output;
    clearActiveCard(context);
    context.state.status = 'running';
    return;
  }

  if (stepName === 'source_coverage') {
    const screening = readJson(context.state.steps[stepName].draft_output.artifact_path);
    const output = atomicWriteJson(join(context.runDir, 'material-screening.json'), screening);
    acceptStep(context, STEP_BY_NAME.get(stepName), output, context.state.steps[stepName].review, {
      continued_with_gaps: true,
      usable_sources: screening.usable_sources?.length || 0
    });
    clearActiveCard(context);
    context.state.status = 'running';
    return;
  }

  if (stepName === 'learning_path') {
    const draftPlan = readJson(context.state.steps[stepName].draft_output.artifact_path);
    const markdown = existsSync(context.state.steps[stepName].draft_markdown_output?.artifact_path)
      ? readFileSync(context.state.steps[stepName].draft_markdown_output.artifact_path, 'utf8')
      : renderPlanMarkdown(draftPlan);
    const output = writePlanArtifacts(context.runDir, { ...draftPlan, markdown }, 'learning-path');
    acceptStep(context, STEP_BY_NAME.get(stepName), output.json, context.state.steps[stepName].review, {
      continued_with_flags: true,
      markdown_path: output.markdown.artifact_path,
      unit_count: draftPlan.units?.length || 0
    });
    clearActiveCard(context);
    context.state.status = 'running';
    return;
  }

  if (stepName === 'notebook_readiness') {
    applySkipNotebook(context);
  }
}

function applyNormalizeTitles(context) {
  const stepName = 'learning_path';
  const draftPlan = readJson(context.state.steps[stepName].draft_output.artifact_path);
  const normalized = normalizePlanTitles(draftPlan);
  const output = writePlanArtifacts(context.runDir, normalized, 'learning-path');
  acceptStep(context, STEP_BY_NAME.get(stepName), output.json, context.state.steps[stepName].review, {
    normalized_titles: true,
    markdown_path: output.markdown.artifact_path,
    unit_count: normalized.units?.length || 0
  });
  clearActiveCard(context);
  context.state.status = 'running';
}

function applyDropFlaggedUnits(context) {
  const stepName = 'learning_path';
  const draftPlan = readJson(context.state.steps[stepName].draft_output.artifact_path);
  const flagged = new Set((context.state.steps[stepName].review.data?.flags || [])
    .map(flag => flag.unit_id)
    .filter(Boolean));
  const nextUnits = (draftPlan.units || []).filter(unit => !flagged.has(unit.unit_id));
  const nextPlan = {
    ...draftPlan,
    units: nextUnits.map((unit, index) => ({ ...unit, order: index + 1 })),
    markdown: renderPlanMarkdown({ ...draftPlan, units: nextUnits })
  };
  const output = writePlanArtifacts(context.runDir, nextPlan, 'learning-path');
  acceptStep(context, STEP_BY_NAME.get(stepName), output.json, context.state.steps[stepName].review, {
    dropped_flagged_units: flagged.size,
    markdown_path: output.markdown.artifact_path,
    unit_count: nextPlan.units.length
  });
  clearActiveCard(context);
  context.state.status = 'running';
}

function applySkipNotebook(context) {
  const step = STEP_BY_NAME.get('notebook_readiness');
  const skippedState = {
    status: 'skipped',
    reason: 'user_approved_skip',
    sources: []
  };
  const output = atomicWriteJson(join(context.runDir, 'path-notebook-state.json'), skippedState);
  acceptStep(context, step, output, context.state.steps[step.name].review, {
    skipped: true
  });
  context.state.handoffs.notebook = { status: 'skipped' };
  clearActiveCard(context);
  context.state.status = 'running';
}

function acceptRefinedGoal(context, goal) {
  context.state.inputs.goal = goal;
  context.state.status = 'running';
  context.state.phase = 'ziel_verstehen';
  context.state.active_card = null;
  for (const step of STEP_DEFINITIONS) delete context.state.steps[step.name];
  context.state.retry_budget = {};
  context.state.action_params = {};
  appendAgentTurn(context, `Lernziel aktualisiert: ${goal}`);
}

function normalizeAgentLearningContract(inputs, runId) {
  const raw = inputs.contract_path ? readJson(inputs.contract_path) : {};
  const goal = normalizeText(raw.goal || inputs.goal);
  const goalTokens = tokenize(goal);
  if (!goal || goalTokens.length === 0) {
    throw new Error('Bitte gib ein konkretes Lernziel ein.');
  }

  const expansion = reviewGoalExpansion({
    goal,
    current_level: raw.current_level || inputs.current_level || 'beginner',
    language: raw.language || inputs.language || 'de'
  });
  if (expansion.decision === 'ask_user' && goalTokens.length < 2) {
    throw new Error('Das Lernziel ist noch zu vage. Bitte beschreibe konkreter, was du lernen willst.');
  }

  const preferredMaterials = normalizeList(raw.preferred_materials || inputs.preferred_materials);
  return {
    contract_id: raw.contract_id || `${runId}-contract`,
    goal,
    current_level: normalizeChoice(raw.current_level || inputs.current_level, 'beginner'),
    time_budget: normalizeText(raw.time_budget || inputs.time_budget) || null,
    target_outcome: normalizeChoice(raw.target_outcome || inputs.target_outcome, 'prototype'),
    style: normalizeChoice(raw.style || inputs.style, 'practical'),
    language: normalizeChoice(raw.language || inputs.language, 'de'),
    preferred_materials: preferredMaterials,
    defaults: {
      current_level: raw.current_level || inputs.current_level ? null : 'beginner',
      target_outcome: raw.target_outcome || inputs.target_outcome ? null : 'prototype',
      style: raw.style || inputs.style ? null : 'practical',
      language: raw.language || inputs.language ? null : 'de',
      preferred_materials: preferredMaterials.length > 0 ? null : []
    },
    field_usage: {
      goal: 'keyword_topic_title_description_signal',
      current_level: 'level_fit_signal',
      time_budget: 'metadata_for_planner',
      target_outcome: 'practical_output_signal',
      style: 'material_and_course_mix_signal',
      language: 'response_asset_language_metadata',
      preferred_materials: 'material_signal'
    },
    created_at: new Date().toISOString()
  };
}

async function reviewWithProvider(context, task, inputData) {
  return context.provider.reviewJson({
    task,
    input: inputData
  });
}

function reviewNotebookReadiness(notebookState, mode) {
  if (notebookState.status === 'sources_ready') {
    return {
      decision: 'accepted',
      reasons: [mode === 'dry_run' ? 'Dry-Run-Notebook ist bereit.' : 'Notebook-Quellen sind bereit.'],
      default_action: null,
      proposed_actions: [],
      data: {
        status: notebookState.status,
        source_count: notebookState.sources?.length || 0
      }
    };
  }

  return {
    decision: 'ask_user',
    reasons: [`Notebook ist noch nicht bereit: ${notebookState.status}.`],
    default_action: 'skip_notebook',
    proposed_actions: [
      { action: 'skip_notebook', label: 'Notebook ueberspringen', params: {}, safe_default: true },
      { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
    ],
    data: {
      status: notebookState.status,
      source_count: notebookState.sources?.length || 0
    }
  };
}

function beginStep(context, step, dependencies = []) {
  context.state.steps[step.name] = {
    ...(context.state.steps[step.name] || {}),
    status: 'running',
    phase: step.phase,
    step_version: step.version,
    depends_on: dependencies,
    started_at: new Date().toISOString(),
    input_fingerprint: createInputFingerprint({
      stepName: step.name,
      stepVersion: step.version,
      taskPolicyVersion: `${step.name}.policy.v1`,
      inputs: context.state.inputs,
      dependencyHashes: Object.fromEntries(dependencies.map(name => [
        name,
        context.state.steps[name]?.accepted_output?.artifact_sha256
      ]).filter(([, value]) => value))
    })
  };
  context.state.active_card = null;
  context.state.status = 'running';
  persistState(context);
}

function acceptStep(context, step, output, review, summary = {}) {
  const acceptedOutput = {
    artifact_path: output.artifact_path,
    artifact_sha256: output.artifact_sha256,
    schema: output.schema || step.schema,
    summary
  };
  context.state.steps[step.name] = {
    ...(context.state.steps[step.name] || {}),
    status: 'accepted',
    phase: step.phase,
    step_version: step.version,
    review,
    accepted_output: acceptedOutput,
    completed_at: new Date().toISOString()
  };
  context.state.phase = nextPhaseAfter(step.name);
  context.state.status = 'running';
  context.state.active_card = null;
  persistState(context);
}

function waitForUser(context, step, review, cardInput) {
  const cardText = renderReviewCard({
    phase: humanPhase(step.phase),
    searched: cardInput.searched,
    found: cardInput.found,
    review
  });
  const card = saveReviewCard(context.runDir, step.phase, cardText);
  context.state.steps[step.name] = {
    ...(context.state.steps[step.name] || {}),
    status: 'waiting_for_user',
    phase: step.phase,
    step_version: step.version,
    review,
    card_output: card,
    updated_at: new Date().toISOString()
  };
  context.state.phase = step.phase;
  context.state.status = 'waiting_for_user';
  context.state.active_card = {
    step: step.name,
    phase: step.phase,
    review,
    card_path: card.artifact_path,
    created_at: new Date().toISOString()
  };
  appendAgentTurn(context, cardText);
  context.logger.log(`\n${cardText}`);
  persistState(context);
}

function setDraftOutput(context, step, output, review) {
  context.state.steps[step.name] = {
    ...(context.state.steps[step.name] || {}),
    status: 'waiting_for_user',
    phase: step.phase,
    step_version: step.version,
    review,
    draft_output: {
      artifact_path: output.artifact_path,
      artifact_sha256: output.artifact_sha256,
      schema: output.schema || step.schema
    }
  };
}

function resetStep(context, stepName) {
  const step = STEP_BY_NAME.get(stepName);
  context.state.steps[stepName] = {
    status: 'retry_approved',
    phase: step.phase,
    step_version: step.version,
    retry_approved_at: new Date().toISOString()
  };
  context.state.phase = step.phase;
}

function clearActiveCard(context) {
  context.state.active_card = null;
}

function isStepAccepted(state, stepName) {
  return state.steps?.[stepName]?.status === 'accepted';
}

function loadAcceptedJson(context, stepName) {
  const artifactPath = context.state.steps?.[stepName]?.accepted_output?.artifact_path;
  if (!artifactPath) throw new Error(`Accepted output fehlt fuer ${stepName}.`);
  return readJson(artifactPath);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

function writePlanArtifacts(runDir, plan, basename) {
  const markdown = plan.markdown || renderPlanMarkdown(plan);
  const { markdown: _markdown, ...jsonPlan } = plan;
  return {
    json: atomicWriteJson(join(runDir, `${basename}.json`), jsonPlan),
    markdown: atomicWriteArtifact(join(runDir, `${basename}.md`), markdown)
  };
}

function normalizePlanTitles(plan) {
  const units = (plan.units || []).map(unit => {
    const title = normalizeUnitTitle(unit.title);
    return {
      ...unit,
      title,
      learning_goal: unit.learning_goal
        ? unit.learning_goal.replace(unit.title, title)
        : unit.learning_goal
    };
  });
  return {
    ...plan,
    units,
    markdown: renderPlanMarkdown({ ...plan, units })
  };
}

function renderPlanMarkdown(plan) {
  const lines = [
    `# ${plan.title || 'Learning Path'}`,
    '',
    `Contract: \`${plan.contract_id || ''}\``,
    `Language: ${plan.language || 'de'}`,
    '',
    '## Units',
    ''
  ];
  for (const unit of plan.units || []) {
    lines.push(`### ${unit.order}. ${unit.title}`);
    lines.push('');
    lines.push(`- Goal: ${unit.learning_goal || ''}`);
    lines.push(`- Difficulty: ${unit.difficulty || 'standard'}`);
    lines.push(`- Effort: ${unit.estimated_effort || ''}`);
    lines.push(`- Required sources: ${(unit.required_source_ids || []).join(', ') || 'none'}`);
    lines.push(`- Optional sources: ${(unit.optional_source_ids || []).join(', ') || 'none'}`);
    if ((unit.gaps || []).length > 0) lines.push(`- Gaps: ${unit.gaps.map(gap => gap.code).join(', ')}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function buildSelectorTermsForRun(context, expansion) {
  const baseTerms = expansion.selector_terms || [];
  const params = context.state.action_params?.course_discovery || {};
  if (!params.broaden) return baseTerms;
  const broadened = new Set(baseTerms);
  for (const term of baseTerms) {
    for (const extra of BROADENED_SELECTOR_TERMS[term] || []) broadened.add(extra);
  }
  return [...broadened];
}

function consumeActionParams(context, stepName) {
  const params = context.state.action_params?.[stepName] || {};
  if (context.state.action_params) delete context.state.action_params[stepName];
  return params;
}

function getRetryBudget(context, stepName) {
  if (!context.state.retry_budget) context.state.retry_budget = {};
  if (!(stepName in context.state.retry_budget)) context.state.retry_budget[stepName] = DEFAULT_RETRY_BUDGET;
  return context.state.retry_budget[stepName];
}

function resolveRunDir(options) {
  if (options.newRun) {
    const runId = options.runId || buildRunId(options.goal || 'agent-run');
    options.runId = runId;
    if (options.outDir) return resolve(options.outDir);
    return resolve(DEFAULT_OUTPUT_ROOT, runId);
  }
  if (options.runId) return resolveExistingRunDir(options);
  const runId = buildRunId(options.goal || 'agent-run');
  options.runId = runId;
  return resolve(options.outDir || join(DEFAULT_OUTPUT_ROOT, runId));
}

function resolveExistingRunDir(options) {
  if (options.outDir) {
    const direct = resolve(options.outDir);
    if (existsSync(getAgentStatePath(direct))) return direct;
    if (options.runId) return resolve(direct, options.runId);
    return direct;
  }
  if (!options.runId) throw new Error('Bitte --run <run-id> angeben.');
  return resolve(DEFAULT_OUTPUT_ROOT, options.runId);
}

function buildRunId(value) {
  const base = String(value || 'agent-run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'agent-run';
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function persistState(context) {
  context.state.updated_at = new Date().toISOString();
  writeAgentState(context.runDir, context.state);
  writeAgentRunMarkdown(context.runDir, context.state);
}

function buildSessionResult(context) {
  return {
    runDir: context.runDir,
    state: context.state,
    statePath: getAgentStatePath(context.runDir),
    markdownPath: join(context.runDir, 'AGENT_RUN.md')
  };
}

function announceRun(context) {
  if (context.state.announced_at) return;
  context.state.announced_at = new Date().toISOString();
  appendAgentTurn(context, `Agent Run gestartet: ${context.state.run_id}`);
}

function appendAgentTurn(context, text) {
  const turn = appendConversationTurn(join(context.runDir, context.state.conversation.log_path), {
    role: 'agent',
    phase: context.state.phase,
    text
  });
  context.state.conversation.last_turn_id = turn.turn_id;
  return turn;
}

function logStatusLine(context) {
  const line = `Status: ${context.state.status}; Phase: ${humanPhase(context.state.phase)}; Run: ${context.state.run_id}`;
  context.logger.log(line);
  appendAgentTurn(context, line);
}

function nextPhaseAfter(stepName) {
  const step = STEP_BY_NAME.get(stepName);
  const index = AGENT_PHASES.indexOf(step.phase);
  return AGENT_PHASES[Math.min(index + 1, AGENT_PHASES.length - 1)];
}

function humanPhase(phase) {
  return String(phase || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function summarizeTerms(terms) {
  if (!Array.isArray(terms) || terms.length === 0) return '-';
  return terms.slice(0, 8).join(', ');
}

function normalizeCommand(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeChoice(value, fallback) {
  const text = normalizeText(value).toLowerCase().replaceAll('_', '-');
  return text || fallback;
}

function normalizeList(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map(item => normalizeText(item).toLowerCase()).filter(Boolean))];
}

function tokenize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2);
}
