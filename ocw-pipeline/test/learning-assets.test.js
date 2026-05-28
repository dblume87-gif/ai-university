import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildGenerateAssetArgs,
  buildTextAssetArgs,
  downloadLearningAsset,
  getLearnAssetOptions,
  getLearnAssetsOptions,
  listLearningAssets,
  runLearningAssetCreate,
  showLearningAsset
} from '../src/learning/assets.js';
import {
  createInitialChatState,
  saveChatState
} from '../src/learning/store.js';

test('getLearnAssetOptions: liest Typ, Unit, Prompt und Sources', () => {
  const options = getLearnAssetOptions([
    '--type', 'quiz',
    '--unit', '6',
    '--prompt', 'Fokus auf Rekursion',
    '--source', 's1',
    '--source', 's2'
  ]);

  assert.equal(options.type, 'quiz');
  assert.equal(options.unit, '6');
  assert.equal(options.prompt, 'Fokus auf Rekursion');
  assert.deepEqual(options.sourceIds, ['s1', 's2']);
});

test('getLearnAssetsOptions: liest assets show und download Optionen', () => {
  const show = getLearnAssetsOptions(['show', 'asset-1', '--path-id', 'p1']);
  const download = getLearnAssetsOptions(['download', 'asset-1', '--force', '--format', 'markdown']);

  assert.equal(show.action, 'show');
  assert.equal(show.assetId, 'asset-1');
  assert.equal(show.pathId, 'p1');
  assert.equal(download.action, 'download');
  assert.equal(download.force, true);
  assert.equal(download.format, 'markdown');
});

test('buildTextAssetArgs: baut source-gefiltertes ask --json', () => {
  const args = buildTextAssetArgs({
    prompt: 'Erstelle eine Zusammenfassung',
    notebookId: 'n1',
    sourceIds: ['s1', 's2']
  });

  assert.deepEqual(args, ['ask', 'Erstelle eine Zusammenfassung', '-n', 'n1', '-s', 's1', '-s', 's2', '--json']);
});

test('buildGenerateAssetArgs: baut native NotebookLM Generate Args', () => {
  const args = buildGenerateAssetArgs({
    type: 'report',
    prompt: 'Study Guide',
    notebookId: 'n1',
    sourceIds: ['s1'],
    format: 'study-guide',
    language: 'de',
    wait: true
  });

  assert.deepEqual(args, [
    'generate',
    'report',
    'Study Guide',
    '-n',
    'n1',
    '-s',
    's1',
    '--format',
    'study-guide',
    '--language',
    'de',
    '--wait',
    '--json'
  ]);
});

test('runLearningAssetCreate: erzeugt direkt nutzbares Textasset mit content.md und Index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-asset-text-'));
  const statePath = join(dir, 'chat_state.json');
  const outRoot = join(dir, 'assets');
  saveChatState(statePath, {
    ...createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s-stored'] }),
    conversation_id: 'c1'
  });

  let capturedArgs;
  const result = await runLearningAssetCreate({
    type: 'summary',
    prompt: 'Fasse Rekursion zusammen.',
    pathId: 'p1',
    notebookId: 'n1',
    sourceIds: [],
    statePath,
    outRoot,
    assetId: 'asset-summary'
  }, async args => {
    capturedArgs = args;
    return {
      answer: 'Rekursion ruft sich selbst auf. [1]',
      references: [{ source_id: 's-stored', citation_number: 1 }]
    };
  });

  assert.deepEqual(capturedArgs, ['ask', 'Fasse Rekursion zusammen.', '-n', 'n1', '-s', 's-stored', '--json']);
  assert.equal(result.asset.asset_id, 'asset-summary');
  assert.equal(result.asset.status, 'local_ready');
  assert.equal(result.downloadRequired, false);
  assert.equal(readFileSync(join(outRoot, 'asset-summary', 'content.md'), 'utf8'), 'Rekursion ruft sich selbst auf. [1]\n');

  const index = JSON.parse(readFileSync(join(outRoot, 'index.json'), 'utf8'));
  assert.equal(index.asset_count, 1);
  assert.equal(index.assets[0].asset_id, 'asset-summary');
});

test('runLearningAssetCreate: erzeugt native Artifact-Metadaten aus Unit-Sources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-asset-native-'));
  const statePath = join(dir, 'chat_state.json');
  const unitMapPath = join(dir, 'unit_source_map.json');
  const outRoot = join(dir, 'assets');
  saveChatState(statePath, createInitialChatState({ pathId: 'p1', notebookId: 'n1' }));
  writeFileSync(unitMapPath, JSON.stringify({
    units: [
      {
        unit_id: '6-0001:u06',
        unit_number: 6,
        title: 'Recursion',
        notebook_source_ids: ['s-youtube', 's-pdf']
      }
    ]
  }));

  let capturedArgs;
  const result = await runLearningAssetCreate({
    type: 'quiz',
    pathId: 'p1',
    notebookId: 'n1',
    sourceIds: [],
    unit: '6',
    unitMapPath,
    statePath,
    outRoot,
    assetId: 'asset-quiz',
    wait: false
  }, async args => {
    capturedArgs = args;
    return {
      id: 'artifact-quiz',
      title: 'Recursion Quiz',
      type: 'quiz',
      status: 'completed'
    };
  });

  assert.deepEqual(capturedArgs, [
    'generate',
    'quiz',
    'Erstelle ein Quiz fuer Unit 6 (Recursion).',
    '-n',
    'n1',
    '-s',
    's-youtube',
    '-s',
    's-pdf',
    '--no-wait',
    '--json'
  ]);
  assert.equal(result.asset.strategy, 'notebooklm_artifact');
  assert.equal(result.asset.artifact.id, 'artifact-quiz');
  assert.equal(result.downloadRequired, true);
});

test('listLearningAssets/showLearningAsset: zeigt lokale Inhalte oder Download-Hinweis', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-assets-list-'));
  const statePath = join(dir, 'chat_state.json');
  const outRoot = join(dir, 'assets');
  saveChatState(statePath, createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s1'] }));

  await runLearningAssetCreate({
    type: 'summary',
    prompt: 'Zusammenfassung',
    pathId: 'p1',
    notebookId: 'n1',
    sourceIds: [],
    statePath,
    outRoot,
    assetId: 'asset-summary'
  }, async () => ({ answer: 'Inhalt', references: [] }));
  await runLearningAssetCreate({
    type: 'quiz',
    prompt: 'Quiz',
    pathId: 'p1',
    notebookId: 'n1',
    sourceIds: ['s1'],
    statePath,
    outRoot,
    assetId: 'asset-quiz'
  }, async () => ({ id: 'artifact-quiz', status: 'completed' }));

  const listed = listLearningAssets({ outRoot });
  const summary = showLearningAsset({ outRoot, assetId: 'asset-summary' });
  const quiz = showLearningAsset({ outRoot, assetId: 'asset-quiz' });

  assert.equal(listed.assets.length, 2);
  assert.equal(summary.content, 'Inhalt\n');
  assert.equal(summary.downloadRequired, false);
  assert.equal(quiz.content, null);
  assert.equal(quiz.downloadRequired, true);
});

test('downloadLearningAsset: aktualisiert Asset-Metadaten und Index', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-asset-download-'));
  const statePath = join(dir, 'chat_state.json');
  const outRoot = join(dir, 'assets');
  saveChatState(statePath, createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s1'] }));
  await runLearningAssetCreate({
    type: 'quiz',
    prompt: 'Quiz',
    pathId: 'p1',
    notebookId: 'n1',
    sourceIds: [],
    statePath,
    outRoot,
    assetId: 'asset-quiz'
  }, async () => ({ id: 'artifact-quiz', status: 'completed' }));

  let capturedArgs;
  const result = await downloadLearningAsset({
    outRoot,
    assetId: 'asset-quiz',
    format: 'markdown',
    force: true
  }, async args => {
    capturedArgs = args;
    return { status: 'downloaded', output_path: args.at(-3) };
  });

  assert.deepEqual(capturedArgs, [
    'download',
    'quiz',
    '-n',
    'n1',
    '-a',
    'artifact-quiz',
    '--format',
    'markdown',
    join(outRoot, 'asset-quiz', 'quiz.md'),
    '--json',
    '--force'
  ]);
  assert.equal(result.asset.status, 'downloaded');
  assert.equal(result.asset.local_files.some(file => file.kind === 'download' && file.filename === 'quiz.md'), true);

  const index = JSON.parse(readFileSync(join(outRoot, 'index.json'), 'utf8'));
  assert.equal(index.assets[0].status, 'downloaded');
});
