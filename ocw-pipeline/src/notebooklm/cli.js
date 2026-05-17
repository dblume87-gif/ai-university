/**
 * Dünner Wrapper um das `notebooklm`-CLI: Aufruf via spawnSync, JSON-Parsing,
 * Shell-sicheres Kommando-Rendering für Logs.
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRAPER_ROOT = join(__dirname, '../..');
const WORKSPACE_ROOT = join(SCRAPER_ROOT, '..');

export function runNotebookLmJson(args) {
  const result = spawnSync('notebooklm', args, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`notebooklm ${args.join(' ')} fehlgeschlagen: ${result.stderr || result.stdout}`);
  }

  const output = result.stdout.trim();
  if (!output) return {};

  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`notebooklm ${args.join(' ')}: ungültige JSON-Ausgabe: ${output.slice(0, 200)}`);
  }
}

export function formatNotebookLmCommand(args) {
  return ['notebooklm', ...args].map(shellQuote).join(' ');
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

export function extractNotebookId(result) {
  return result.id || result.notebook_id || result.notebookId || result.notebook?.id;
}

export function extractSourceId(result) {
  return result.id || result.source_id || result.sourceId || result.source?.id;
}
