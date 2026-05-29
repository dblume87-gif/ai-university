import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { parseCliArgs } from '../lib/cli.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { formatNotebookLmCommand, runNotebookLmJson } from '../notebooklm/cli.js';
import { loadLearningPathPlan } from './planner.js';

const NOTEBOOK_SCHEMA = {
  stringFlags: ['--plan', '--state', '--notebook-id', '--title'],
  intFlags: ['--max-sources', '--timeout'],
  booleanFlags: ['--create', '--wait', '--dry-run', '--help', '-h']
};

export function getPathNotebookOptions(args) {
  const parsed = parseCliArgs(args, NOTEBOOK_SCHEMA);
  return {
    planPath: parsed.getString('--plan', parsed.positional[0]),
    statePath: parsed.getString('--state', null),
    notebookId: parsed.getString('--notebook-id', null),
    title: parsed.getString('--title', null),
    maxSources: parsed.getPositiveInt('--max-sources', 60),
    timeout: parsed.getPositiveInt('--timeout', 180),
    create: parsed.has('--create'),
    wait: parsed.has('--wait'),
    dryRun: parsed.has('--dry-run'),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export async function runPathNotebookWorkflow(options = {}, runner = runNotebookLmJson) {
  if (!options.plan && !options.planPath) throw new Error('Bitte Learning-Path-Plan mit --plan angeben.');
  const plan = options.plan || loadLearningPathPlan(options.planPath);
  const statePath = resolve(options.statePath || defaultStatePath(plan));
  const state = loadNotebookState(statePath, plan, options);
  const sources = selectNotebookSources(plan).slice(0, options.maxSources || 60);

  if (!state.notebook.notebook_id && (options.create || options.dryRun)) {
    await createNotebook({ state, plan, options, runner });
    saveNotebookState(statePath, state);
  }

  if (!state.notebook.notebook_id) {
    throw new Error('Kein Notebook vorhanden. Bitte --create oder --notebook-id verwenden.');
  }

  state.status = 'uploading_sources';
  for (const source of sources) {
    await addAndMaybeWaitSource({ state, source, options, runner });
    saveNotebookState(statePath, state);
  }

  const required = state.sources.filter(source => source.required);
  const failedRequired = required.filter(source => source.status === 'failed');
  const pendingRequired = required.filter(source => source.status !== 'ready' && source.status !== 'dry_run_ready');
  state.status = failedRequired.length > 0
    ? 'failed'
    : pendingRequired.length === 0
      ? 'sources_ready'
      : 'uploading_sources';
  state.updated_at = new Date().toISOString();
  saveNotebookState(statePath, state);

  return { state, statePath };
}

export function loadNotebookState(statePath, plan, options = {}) {
  if (existsSync(statePath)) return JSON.parse(readFileSync(statePath, 'utf8'));
  return {
    path_id: plan.path_id,
    contract_id: plan.contract_id,
    status: 'creating_notebook',
    notebook: {
      title: options.title || buildNotebookTitle(plan),
      notebook_id: options.notebookId || null,
      status: options.notebookId ? 'ready' : 'planned'
    },
    sources: [],
    resume_point: 'initialized',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

export function saveNotebookState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function selectNotebookSources(plan) {
  const sources = Array.isArray(plan.sources) ? plan.sources : [];
  return sources.filter(source => source.upload_content || source.source_url || source.local_path);
}

export function printPathNotebookResult(result) {
  console.log('\n=== Path Notebook ===\n');
  console.log(`Path: ${result.state.path_id}`);
  console.log(`Status: ${result.state.status}`);
  console.log(`Notebook: ${result.state.notebook.notebook_id || '(none)'}`);
  console.log(`State: ${result.statePath}`);
  console.log(`Sources: ${result.state.sources.length}`);
}

async function createNotebook({ state, plan, options, runner }) {
  state.status = 'creating_notebook';
  state.notebook.status = 'creating';
  const title = options.title || state.notebook.title || buildNotebookTitle(plan);
  if (options.dryRun) {
    state.notebook.notebook_id = options.notebookId || `dry-run-${plan.path_id}`;
    state.notebook.status = 'ready';
    state.resume_point = 'notebook_created_dry_run';
    return;
  }
  const args = ['create', title, '--json'];
  const result = await runner(args);
  state.notebook.notebook_id = result.notebook?.id || result.id || result.notebook_id;
  state.notebook.status = 'ready';
  state.notebook.command = formatNotebookLmCommand(args);
  state.notebook.raw_result = result;
  state.resume_point = 'notebook_created';
}

async function addAndMaybeWaitSource({ state, source, options, runner }) {
  const existing = state.sources.find(item => item.source_id === source.source_id);
  if (existing?.status === 'ready' || existing?.status === 'dry_run_ready') return;

  const stateSource = existing || {
    source_id: source.source_id,
    title: source.title,
    required: Boolean(source.required),
    upload_content: source.upload_content || source.source_url || source.local_path,
    notebook_source_id: null,
    status: 'pending'
  };
  if (!existing) state.sources.push(stateSource);

  if (options.dryRun) {
    stateSource.notebook_source_id = `dry-${source.source_id}`;
    stateSource.status = 'dry_run_ready';
    stateSource.add_command = formatNotebookLmCommand(buildAddArgs(state.notebook.notebook_id, stateSource));
    stateSource.wait_command = formatNotebookLmCommand(buildWaitArgs(state.notebook.notebook_id, stateSource.notebook_source_id, options.timeout));
    state.resume_point = `source_ready:${source.source_id}`;
    return;
  }

  try {
    const addArgs = buildAddArgs(state.notebook.notebook_id, stateSource);
    const addResult = await runner(addArgs);
    stateSource.notebook_source_id = addResult.source?.id || addResult.id || addResult.source_id;
    stateSource.status = 'uploaded';
    stateSource.add_command = formatNotebookLmCommand(addArgs);
    stateSource.add_result = addResult;
    if (options.wait) {
      const waitArgs = buildWaitArgs(state.notebook.notebook_id, stateSource.notebook_source_id, options.timeout);
      const waitResult = await runner(waitArgs);
      stateSource.status = waitResult.status === 'ready' ? 'ready' : String(waitResult.status || 'unknown');
      stateSource.wait_command = formatNotebookLmCommand(waitArgs);
      stateSource.wait_result = waitResult;
    }
    state.resume_point = `source_${stateSource.status}:${source.source_id}`;
  } catch (err) {
    stateSource.status = 'failed';
    stateSource.error = err.message;
    if (stateSource.required) state.status = 'failed';
  }
}

function buildAddArgs(notebookId, source) {
  const args = ['source', 'add', source.upload_content, '-n', notebookId, '--json'];
  if (source.title) args.push('--title', source.title);
  return args;
}

function buildWaitArgs(notebookId, sourceId, timeout) {
  return ['source', 'wait', sourceId, '-n', notebookId, '--timeout', String(timeout || 180), '--json'];
}

function buildNotebookTitle(plan) {
  return `AIU Path: ${(plan.title || plan.path_id || 'Learning Path').slice(0, 80)} - ${plan.path_id}`;
}

function defaultStatePath(plan) {
  return join(__dirname, '../../output/learning-paths', plan.path_id, 'path-notebook-state.json');
}
