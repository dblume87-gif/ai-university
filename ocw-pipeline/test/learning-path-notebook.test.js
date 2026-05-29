import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getPathNotebookOptions,
  runPathNotebookWorkflow,
  selectNotebookSources
} from '../src/learning/path-notebook.js';

test('getPathNotebookOptions: liest dry-run/create/wait Optionen', () => {
  const options = getPathNotebookOptions(['--plan', 'plan.json', '--create', '--wait', '--dry-run']);

  assert.equal(options.planPath, 'plan.json');
  assert.equal(options.create, true);
  assert.equal(options.wait, true);
  assert.equal(options.dryRun, true);
});

test('selectNotebookSources: waehlt nur uploadbare Sources', () => {
  const sources = selectNotebookSources({
    sources: [
      { source_id: 's1', upload_content: 'https://example.com/a.pdf' },
      { source_id: 's2' }
    ]
  });

  assert.deepEqual(sources.map(source => source.source_id), ['s1']);
});

test('runPathNotebookWorkflow: dry-run erzeugt State und sources_ready', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-notebook-dry-'));
  const statePath = join(dir, 'state.json');
  const result = await runPathNotebookWorkflow({
    plan: samplePlan(),
    statePath,
    create: true,
    wait: true,
    dryRun: true
  }, async () => {
    throw new Error('runner should not be called in dry-run');
  });

  assert.equal(result.state.status, 'sources_ready');
  assert.equal(result.state.notebook.notebook_id, 'dry-run-path-1');
  assert.equal(result.state.sources.length, 2);
  assert.equal(result.state.sources.every(source => source.status === 'dry_run_ready'), true);
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).status, 'sources_ready');
});

test('runPathNotebookWorkflow: live runner add/wait und Resume vermeiden Doppelupload', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-notebook-live-'));
  const statePath = join(dir, 'state.json');
  const calls = [];
  const runner = async args => {
    calls.push(args);
    if (args[0] === 'create') return { notebook: { id: 'n1' } };
    if (args[0] === 'source' && args[1] === 'add') return { source: { id: `nb-src-${calls.length}` } };
    if (args[0] === 'source' && args[1] === 'wait') return { status: 'ready' };
    return {};
  };

  const first = await runPathNotebookWorkflow({
    plan: samplePlan(),
    statePath,
    create: true,
    wait: true
  }, runner);
  const second = await runPathNotebookWorkflow({
    plan: samplePlan(),
    statePath,
    create: true,
    wait: true
  }, runner);

  assert.equal(first.state.status, 'sources_ready');
  assert.equal(second.state.sources.length, 2);
  assert.equal(calls.filter(args => args[0] === 'source' && args[1] === 'add').length, 2);
});

function samplePlan() {
  return {
    path_id: 'path-1',
    contract_id: 'contract-1',
    title: 'Learning Path: AI Apps',
    sources: [
      {
        source_id: 's1',
        title: 'Lecture 1',
        upload_content: 'https://youtube.com/watch?v=abc',
        required: true
      },
      {
        source_id: 's2',
        title: 'Problem Set',
        upload_content: 'https://example.com/ps.pdf',
        required: false
      }
    ]
  };
}
