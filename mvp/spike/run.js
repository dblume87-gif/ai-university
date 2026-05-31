import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const requireFromPipeline = createRequire(new URL('../../ocw-pipeline/package.json', import.meta.url));
const Database = requireFromPipeline('better-sqlite3');

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputRoot = join(__dirname, 'output');
const runDir = join(outputRoot, new Date().toISOString().replace(/[:.]/g, '-'));
const schemaPath = join(__dirname, 'answer-schema.json');
const serverPath = join(__dirname, 'server.js');
const dbPath = resolve(__dirname, '../data/library.db');
const codexMode = process.env.SPIKE_CODEX_MODE || 'bypass-approvals';

mkdirSync(runDir, { recursive: true });

const authMode = detectCodexAuthMode();
const first = await runTurn({
  name: 'turn-1',
  prompt: [
    'You are testing MCP tool calling for AI University.',
    'You must call the MCP tool search_courses before answering.',
    'Search for MIT OCW courses about Business Strategy.',
    'Return only JSON matching the output schema.',
    'Set used_search_tool=true only if you used search_courses.',
    'Every course in courses[] must come from the tool result.',
    'data_basis must explicitly mention title and topics from library.db.'
  ].join('\n')
});

const second = await runTurn({
  name: 'turn-2',
  prompt: [
    'You are testing replay-based multi-turn MCP tool calling for AI University.',
    'Previous user asked for Business Strategy courses.',
    `Previous assistant JSON:\n${first.resultText}`,
    'New user message: Suche breiter. Beziehe auch strategic management, competitive advantage und management strategy ein.',
    'You must call search_courses again with a broader or different query before answering.',
    'Return only JSON matching the output schema.',
    'Set used_search_tool=true only if you used search_courses.',
    'Every course in courses[] must come from the new tool result.',
    'data_basis must explicitly mention title and topics from library.db.'
  ].join('\n')
});

const report = evaluate({ authMode, first, second });
writeFileSync(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(join(runDir, 'README.md'), renderRunReadme(report), 'utf8');

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

async function runTurn({ name, prompt }) {
  const resultPath = join(runDir, `${name}.result.json`);
  const eventsPath = join(runDir, `${name}.events.jsonl`);
  const toolLogPath = join(runDir, `${name}.tool-calls.jsonl`);
  const debugLogPath = join(runDir, `${name}.mcp-debug.jsonl`);
  const args = [
    'exec',
    '--cd', __dirname,
    '--skip-git-repo-check',
    ...codexExecutionArgs(),
    '--ephemeral',
    '--output-schema', schemaPath,
    '--output-last-message', resultPath,
    '--json',
    '-c', `mcp_servers.ocw_search.command=${JSON.stringify(process.execPath)}`,
    '-c', `mcp_servers.ocw_search.args=${JSON.stringify([serverPath])}`,
    '-c', `mcp_servers.ocw_search.env.SPIKE_LIBRARY_DB=${JSON.stringify(dbPath)}`,
    '-c', `mcp_servers.ocw_search.env.SPIKE_TOOL_LOG=${JSON.stringify(toolLogPath)}`,
    '-c', `mcp_servers.ocw_search.env.SPIKE_DEBUG_LOG=${JSON.stringify(debugLogPath)}`,
    prompt
  ];

  const result = await spawnCodex(args, eventsPath);
  return {
    ...result,
    name,
    resultPath,
    eventsPath,
    toolLogPath,
    resultJson: readJson(resultPath),
    resultText: readFileSync(resultPath, 'utf8'),
    toolCalls: readJsonl(toolLogPath)
  };
}

function spawnCodex(args, eventsPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('codex', args, {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 120_000);
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => {
      stdout.push(chunk);
      writeFileSync(eventsPath, Buffer.concat(stdout), 'utf8');
    });
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', rejectPromise);
    child.on('close', code => {
      clearTimeout(timeout);
      const out = Buffer.concat(stdout).toString('utf8');
      const err = Buffer.concat(stderr).toString('utf8');
      writeFileSync(eventsPath, out, 'utf8');
      writeFileSync(eventsPath.replace('.events.jsonl', '.stderr.log'), err, 'utf8');
      if (code !== 0) {
        const error = new Error(`codex exec failed with exit code ${code}`);
        error.stdout = out;
        error.stderr = err;
        error.args = args;
        rejectPromise(error);
        return;
      }
      resolvePromise({ stdout: out, stderr: err, args });
    });
  });
}

function evaluate({ authMode, first, second }) {
  const firstCourseIds = first.resultJson.courses.map(course => course.course_id);
  const secondCourseIds = second.resultJson.courses.map(course => course.course_id);
  const checks = {
    auth_subscription: authMode === 'subscription',
    first_tool_called: first.toolCalls.length >= 1 && eventLogMentionsTool(first.stdout),
    first_result_valid: first.resultJson.used_search_tool === true
      && firstCourseIds.length > 0
      && firstCourseIds.every(courseIdExists)
      && mentionsDataBasis(first.resultJson.data_basis),
    second_tool_called: second.toolCalls.length >= 1 && eventLogMentionsTool(second.stdout),
    second_result_valid: second.resultJson.used_search_tool === true
      && secondCourseIds.length > 0
      && secondCourseIds.every(courseIdExists)
      && mentionsDataBasis(second.resultJson.data_basis),
    second_query_changed: first.toolCalls[0]?.args?.query !== second.toolCalls[0]?.args?.query
  };
  return {
    pass: Object.values(checks).every(Boolean),
    auth_mode: authMode,
    codex_mode: codexMode,
    run_dir: runDir,
    decision: codexMode === 'bypass-approvals'
      ? 'Native Codex MCP tool-calling works with approval/sandbox bypass. Headless read-only mode lists the tool but cancels the call before tools/call reaches the server.'
      : 'Headless read-only Codex MCP mode was tested.',
    checks,
    first: summarizeTurn(first),
    second: summarizeTurn(second)
  };
}

function summarizeTurn(turn) {
  return {
    result_path: turn.resultPath,
    events_path: turn.eventsPath,
    tool_log_path: turn.toolLogPath,
    tool_calls: turn.toolCalls,
    courses: turn.resultJson.courses
  };
}

function eventLogMentionsTool(stdout) {
  return String(stdout || '').includes('search_courses') || String(stdout || '').includes('ocw_search');
}

function mentionsDataBasis(value) {
  const text = String(value || '').toLowerCase();
  return text.includes('title') && text.includes('topics') && text.includes('library.db');
}

function codexExecutionArgs() {
  if (codexMode === 'read-only') {
    return ['--sandbox', 'read-only'];
  }
  if (codexMode === 'bypass-approvals') {
    return ['--dangerously-bypass-approvals-and-sandbox'];
  }
  throw new Error(`Unsupported SPIKE_CODEX_MODE: ${codexMode}`);
}

function courseIdExists(courseId) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare('SELECT course_id FROM courses WHERE course_id = ?').get(courseId);
    return Boolean(row);
  } finally {
    db.close();
  }
}

function detectCodexAuthMode() {
  try {
    const auth = readJson(join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json'));
    if (auth.auth_mode === 'chatgpt') return 'subscription';
    if (auth.auth_mode === 'api_key') return 'api_key';
    return auth.auth_mode || 'unknown';
  } catch {
    return 'unknown';
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function renderRunReadme(report) {
  return [
    '# MCP Tool-Calling Spike Result',
    '',
    `Pass: ${report.pass ? 'yes' : 'no'}`,
    `Auth: ${report.auth_mode}`,
    `Codex mode: ${report.codex_mode}`,
    '',
    '## Decision',
    '',
    report.decision,
    '',
    '## Checks',
    '',
    ...Object.entries(report.checks).map(([key, value]) => `- ${key}: ${value ? 'pass' : 'fail'}`),
    ''
  ].join('\n');
}
