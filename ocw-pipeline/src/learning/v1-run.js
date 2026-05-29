import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { parseCliArgs } from '../lib/cli.js';
import {
  normalizeLearningContract,
  saveCandidateSelection,
  saveLearningContract,
  selectCourseCandidates
} from './contract.js';
import {
  saveMaterialScreening,
  screenCandidateMaterials
} from './material-screening.js';
import {
  buildLearningPathPlan,
  saveLearningPathPlan
} from './planner.js';
import { runPathNotebookWorkflow } from './path-notebook.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const V1_SCHEMA = {
  stringFlags: [
    '--goal',
    '--contract',
    '--current-level',
    '--time-budget',
    '--target-outcome',
    '--style',
    '--language',
    '--preferred-materials',
    '--run-id',
    '--out',
    '--db',
    '--units-root'
  ],
  intFlags: ['--limit', '--top', '--max-units', '--max-sources', '--timeout'],
  booleanFlags: ['--dry-run', '--live-notebook', '--force', '--help', '-h']
};

export function getV1RunOptions(args) {
  const parsed = parseCliArgs(args, V1_SCHEMA);
  return {
    action: parsed.positional[0] || 'run',
    goal: parsed.getString('--goal') || parsed.positional.slice(1).join(' '),
    contractPath: parsed.getString('--contract', null),
    currentLevel: parsed.getString('--current-level', null),
    timeBudget: parsed.getString('--time-budget', null),
    targetOutcome: parsed.getString('--target-outcome', null),
    style: parsed.getString('--style', null),
    language: parsed.getString('--language', null),
    preferredMaterials: parsed.getList('--preferred-materials', null),
    runId: parsed.getString('--run-id', null),
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

export async function runV1Harness(options = {}, runner) {
  if (options.action && options.action !== 'run') throw new Error(`Unbekannte V1-Aktion: ${options.action}`);
  const runId = options.runId || buildRunId(options.goal || options.contractPath || 'v1-run');
  const runDir = resolve(options.outDir || join(defaultOutputRoot(), runId));
  prepareRunDir(runDir, options.force);

  const run = createRunRecord({ runId, runDir, options });

  try {
    const contract = await runStep(run, 'contract', () => {
      const normalized = normalizeLearningContract(options);
      const path = saveLearningContract(normalized, join(runDir, 'contract.json'));
      return { artifact_path: path, data: normalized };
    });

    const selection = await runStep(run, 'candidates', () => {
      const data = selectCourseCandidates({
        contract: contract.data,
        dbPath: options.dbPath,
        limit: options.limit
      });
      checkGate(run, 'candidates_present', data.candidate_courses.length > 0, 'failed:candidates', 'No course candidates found.');
      const blocked = data.candidate_courses.filter(candidate => candidate.thematic_fit?.gate !== 'passed');
      checkGate(run, 'thematic_fit_passed', blocked.length === 0, 'failed:candidates', 'Candidate failed thematic fit gate.');
      const path = saveCandidateSelection(data, join(runDir, 'candidates.json'));
      return { artifact_path: path, data };
    });

    const screening = await runStep(run, 'materials', () => {
      const data = screenCandidateMaterials({
        candidateSelection: selection.data,
        contract: contract.data,
        dbPath: options.dbPath,
        unitsRoot: options.unitsRoot,
        top: options.top
      });
      checkGate(run, 'usable_sources_present', data.usable_sources.length > 0, 'failed:materials', 'No usable sources found.');
      const path = saveMaterialScreening(data, join(runDir, 'material-screening.json'));
      return { artifact_path: path, data };
    });

    const plan = await runStep(run, 'plan', () => {
      const data = buildLearningPathPlan({
        screening: screening.data,
        contract: contract.data,
        maxUnits: options.maxUnits
      });
      checkGate(run, 'plan_units_present', data.units.length > 0, 'failed:plan', 'No learning path units generated.');
      const paths = saveLearningPathPlan(data, join(runDir, 'learning-path.json'));
      return { artifact_path: paths.jsonPath, markdown_path: paths.markdownPath, data };
    });

    const notebook = await runStep(run, 'notebook', async () => {
      const result = await runPathNotebookWorkflow({
        plan: plan.data,
        statePath: join(runDir, 'path-notebook-state.json'),
        create: true,
        wait: true,
        dryRun: options.dryRun,
        maxSources: options.maxSources,
        timeout: options.timeout
      }, runner);
      checkGate(run, 'notebook_sources_ready', result.state.status === 'sources_ready', 'failed:notebook', `Notebook state is ${result.state.status}.`);
      return { artifact_path: result.statePath, data: result.state };
    });

    run.handoffs = buildHandoffs({ plan: plan.data, notebook: notebook.data, dryRun: options.dryRun });
    run.status = 'completed';
    run.completed_at = new Date().toISOString();
  } catch (err) {
    run.status = err.gateStatus || 'failed';
    run.error = {
      message: err.message,
      step: run.current_step || null
    };
    run.completed_at = new Date().toISOString();
  }

  const paths = writeRunSummary(runDir, run);
  return { run, runDir, paths };
}

export function printV1RunResult(result) {
  console.log('\n=== V1 Run ===\n');
  console.log(`Run: ${result.run.run_id}`);
  console.log(`Status: ${result.run.status}`);
  console.log(`Dir: ${result.runDir}`);
  console.log(`JSON: ${result.paths.jsonPath}`);
  console.log(`Markdown: ${result.paths.markdownPath}`);
  if (result.run.error) console.log(`Error: ${result.run.error.message}`);
}

function createRunRecord({ runId, runDir, options }) {
  return {
    run_id: runId,
    status: 'running',
    mode: options.dryRun ? 'dry_run' : 'live_notebook',
    run_dir: runDir,
    started_at: new Date().toISOString(),
    budgets: {
      max_candidates: options.limit || 5,
      max_units: options.maxUnits || 12,
      max_sources: options.maxSources || 60
    },
    steps: [],
    gates: [],
    warnings: []
  };
}

async function runStep(run, name, fn) {
  run.current_step = name;
  const step = {
    name,
    status: 'running',
    started_at: new Date().toISOString()
  };
  run.steps.push(step);
  try {
    const result = await fn();
    step.status = 'completed';
    step.completed_at = new Date().toISOString();
    step.artifact_path = result.artifact_path || null;
    if (result.markdown_path) step.markdown_path = result.markdown_path;
    return result;
  } catch (err) {
    step.status = 'failed';
    step.completed_at = new Date().toISOString();
    step.error = err.message;
    throw err;
  }
}

function checkGate(run, name, condition, status, message) {
  run.gates.push({
    name,
    status: condition ? 'passed' : 'failed',
    message: condition ? null : message
  });
  if (condition) return;
  const err = new Error(message);
  err.gateStatus = status;
  throw err;
}

function buildHandoffs({ plan, notebook, dryRun }) {
  return {
    mindmap: dryRun
      ? { status: 'skipped:live_notebook_required' }
      : { status: notebook.status === 'sources_ready' ? 'ready_for_mindmap' : 'blocked' },
    chat: {
      status: plan.units.some(unit => unit.source_ids?.length > 0) ? 'ready_for_unit_source_routing' : 'blocked'
    },
    assets: {
      status: plan.units.some(unit => unit.source_ids?.length > 0) ? 'ready_for_unit_or_source_context' : 'blocked'
    }
  };
}

function writeRunSummary(runDir, run) {
  const jsonPath = join(runDir, 'run.json');
  const markdownPath = join(runDir, 'RUN.md');
  writeFileSync(jsonPath, `${JSON.stringify(withoutCurrentStep(run), null, 2)}\n`, 'utf8');
  writeFileSync(markdownPath, renderRunMarkdown(run), 'utf8');
  return { jsonPath, markdownPath };
}

function renderRunMarkdown(run) {
  const lines = [
    `# V1 Run: ${run.run_id}`,
    '',
    `Status: ${run.status}`,
    `Mode: ${run.mode}`,
    `Started: ${run.started_at}`,
    `Completed: ${run.completed_at || ''}`,
    '',
    '## Steps',
    ''
  ];

  for (const step of run.steps) {
    lines.push(`- ${step.name}: ${step.status}${step.artifact_path ? ` (${step.artifact_path})` : ''}`);
    if (step.error) lines.push(`  Error: ${step.error}`);
  }

  if (run.handoffs) {
    lines.push('', '## Handoffs', '');
    for (const [name, value] of Object.entries(run.handoffs)) {
      lines.push(`- ${name}: ${value.status}`);
    }
  }

  if (run.error) {
    lines.push('', '## Error', '', run.error.message);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function withoutCurrentStep(run) {
  const { current_step, ...rest } = run;
  return rest;
}

function prepareRunDir(runDir, force) {
  if (existsSync(runDir) && !force && readdirSync(runDir).length > 0) {
    throw new Error(`Run-Ordner existiert bereits: ${runDir}. Nutze --force oder eine neue --run-id.`);
  }
  mkdirSync(runDir, { recursive: true });
}

function buildRunId(value) {
  const base = String(value || 'v1-run')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'v1-run';
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function defaultOutputRoot() {
  return join(__dirname, '../../output/learning-paths');
}
