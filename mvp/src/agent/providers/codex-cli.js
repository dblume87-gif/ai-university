import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, 'codex-agent-response.schema.json');

export class CodexCliProvider {
  constructor(options = {}) {
    this.codexBin = options.codexBin || 'codex';
    this.cwd = resolve(options.cwd || join(__dirname, '../../..'));
    this.timeoutMs = options.timeoutMs || 120_000;
    this.sandbox = options.sandbox || 'read-only';
  }

  async generate({ prompt, sessionDir }) {
    mkdirSync(sessionDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultPath = join(sessionDir, `codex-${stamp}.result.json`);
    const eventsPath = join(sessionDir, `codex-${stamp}.events.jsonl`);
    const stderrPath = join(sessionDir, `codex-${stamp}.stderr.log`);
    const args = [
      'exec',
      '--cd', this.cwd,
      '--skip-git-repo-check',
      '--sandbox', this.sandbox,
      '--ephemeral',
      '--output-schema', schemaPath,
      '--output-last-message', resultPath,
      '--json',
      prompt
    ];

    await spawnCodex(this.codexBin, args, {
      cwd: this.cwd,
      timeoutMs: this.timeoutMs,
      eventsPath,
      stderrPath
    });

    return {
      response: JSON.parse(readFileSync(resultPath, 'utf8')),
      artifacts: {
        result_path: resultPath,
        events_path: eventsPath,
        stderr_path: stderrPath
      }
    };
  }
}

export function detectCodexAuthMode() {
  try {
    const authPath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    if (auth.auth_mode === 'chatgpt') return 'subscription';
    if (auth.auth_mode === 'api_key') return 'api_key';
    return auth.auth_mode || 'unknown';
  } catch {
    return 'unknown';
  }
}

function spawnCodex(command, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, options.timeoutMs);
    const stdout = [];
    const stderr = [];

    child.stdout.on('data', chunk => {
      stdout.push(chunk);
      writeFileSync(options.eventsPath, Buffer.concat(stdout), 'utf8');
    });
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', rejectPromise);
    child.on('close', code => {
      clearTimeout(timeout);
      const out = Buffer.concat(stdout).toString('utf8');
      const err = Buffer.concat(stderr).toString('utf8');
      writeFileSync(options.eventsPath, out, 'utf8');
      writeFileSync(options.stderrPath, err, 'utf8');
      if (code !== 0) {
        const error = new Error(`codex exec failed with exit code ${code}`);
        error.stdout = out;
        error.stderr = err;
        rejectPromise(error);
        return;
      }
      if (!existsSync(args[args.indexOf('--output-last-message') + 1])) {
        rejectPromise(new Error('codex exec did not write output-last-message'));
        return;
      }
      resolvePromise();
    });
  });
}

