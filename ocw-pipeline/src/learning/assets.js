import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { parseCliArgs } from '../lib/cli.js';
import { formatNotebookLmCommand, runNotebookLmJson } from '../notebooklm/cli.js';
import {
  DEFAULT_LEARNING_PATH_ID,
  DEFAULT_NOTEBOOK_ID,
  DEFAULT_STATE_PATH,
  DEFAULT_UNIT_MAP_PATH,
  loadChatState
} from './store.js';
import { resolveUnitSourceIds } from './unit-map.js';

const ASSET_SCHEMA = {
  stringFlags: [
    '--type',
    '--prompt',
    '--description',
    '--format',
    '--language',
    '--notebook-id',
    '--path-id',
    '--state',
    '--source',
    '--sources',
    '--unit',
    '--unit-map',
    '--out-root',
    '--asset-id'
  ],
  booleanFlags: ['--wait', '--help', '-h']
};

const ASSETS_SCHEMA = {
  stringFlags: ['--path-id', '--out-root', '--notebook-id', '--format'],
  booleanFlags: ['--force', '--help', '-h']
};

export const TEXT_ASSET_TYPES = new Set(['study-guide', 'summary', 'exercises', 'unit-plan']);
export const NATIVE_ASSET_TYPES = new Set([
  'audio',
  'video',
  'cinematic-video',
  'slide-deck',
  'quiz',
  'flashcards',
  'infographic',
  'data-table',
  'mind-map',
  'report'
]);

export function getLearnAssetOptions(args) {
  const parsed = parseCliArgs(args, ASSET_SCHEMA);
  const sourceIds = [
    ...parsed.getAll('--source', []),
    ...(parsed.getList('--sources', []) || [])
  ].map(value => String(value).trim()).filter(Boolean);

  return {
    type: parsed.getString('--type', parsed.positional[0]),
    prompt: parsed.getString('--prompt') || parsed.getString('--description') || parsed.positional.slice(1).join(' '),
    format: parsed.getString('--format', null),
    language: parsed.getString('--language', null),
    notebookId: parsed.getString('--notebook-id', DEFAULT_NOTEBOOK_ID),
    pathId: parsed.getString('--path-id', DEFAULT_LEARNING_PATH_ID),
    sourceIds,
    unit: parsed.getString('--unit', null),
    unitMapPath: parsed.getString('--unit-map', DEFAULT_UNIT_MAP_PATH),
    statePath: parsed.getString('--state', DEFAULT_STATE_PATH),
    outRoot: parsed.getString('--out-root', null),
    assetId: parsed.getString('--asset-id', null),
    wait: parsed.has('--wait'),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function getLearnAssetsOptions(args) {
  const parsed = parseCliArgs(args, ASSETS_SCHEMA);
  return {
    action: parsed.positional[0] || 'list',
    assetId: parsed.positional[1] || null,
    pathId: parsed.getString('--path-id', DEFAULT_LEARNING_PATH_ID),
    outRoot: parsed.getString('--out-root', null),
    notebookId: parsed.getString('--notebook-id', null),
    format: parsed.getString('--format', null),
    force: parsed.has('--force'),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export async function runLearningAssetCreate(options, runner = runNotebookLmJson) {
  const normalizedType = normalizeAssetType(options.type);
  if (!normalizedType) throw new Error('Bitte Asset-Typ mit --type <type> angeben.');
  if (!TEXT_ASSET_TYPES.has(normalizedType) && !NATIVE_ASSET_TYPES.has(normalizedType)) {
    throw new Error(`Unbekannter Asset-Typ "${options.type}".`);
  }

  const statePath = resolve(options.statePath || DEFAULT_STATE_PATH);
  const state = loadChatState(statePath, {
    pathId: options.pathId,
    notebookId: options.notebookId,
    sourceIds: options.sourceIds || []
  });
  const sourceSelection = resolveAssetSourceSelection({
    optionSourceIds: options.sourceIds || [],
    storedSourceIds: state.selected_source_ids || [],
    unit: options.unit,
    unitMapPath: options.unitMapPath
  });
  if (sourceSelection.sourceIds.length === 0) {
    throw new Error('Keine Sources fuer Asset-Erstellung gefunden. Bitte --source oder --unit angeben oder zuerst chatten.');
  }

  const notebookId = options.notebookId || state.notebook_id;
  const prompt = buildAssetPrompt({
    type: normalizedType,
    prompt: options.prompt,
    unit: sourceSelection.unit
  });
  const assetId = options.assetId || createAssetId(normalizedType);
  const root = getAssetRoot({ pathId: options.pathId || state.path_id, outRoot: options.outRoot });
  const assetDir = join(root, assetId);
  mkdirSync(assetDir, { recursive: true });

  const commandArgs = TEXT_ASSET_TYPES.has(normalizedType)
    ? buildTextAssetArgs({ prompt, notebookId, sourceIds: sourceSelection.sourceIds })
    : buildGenerateAssetArgs({
      type: normalizedType,
      prompt,
      notebookId,
      sourceIds: sourceSelection.sourceIds,
      format: options.format,
      language: options.language,
      wait: options.wait
    });
  const rawResult = await runner(commandArgs);
  const now = new Date().toISOString();
  const asset = {
    asset_id: assetId,
    path_id: options.pathId || state.path_id,
    type: normalizedType,
    strategy: TEXT_ASSET_TYPES.has(normalizedType) ? 'ask_json_text' : 'notebooklm_artifact',
    status: TEXT_ASSET_TYPES.has(normalizedType) ? 'local_ready' : inferArtifactStatus(rawResult),
    prompt,
    notebook_id: notebookId,
    selected_source_ids: sourceSelection.sourceIds,
    source_context: sourceSelection.context,
    unit: sourceSelection.unit ? {
      unit_id: sourceSelection.unit.unit_id,
      unit_number: sourceSelection.unit.unit_number,
      title: sourceSelection.unit.title
    } : null,
    conversation_id: state.conversation_id || null,
    references: rawResult.references || [],
    artifact: extractArtifactMetadata(rawResult),
    command: formatNotebookLmCommand(commandArgs),
    raw_result: rawResult,
    created_at: now,
    updated_at: now,
    local_files: []
  };

  if (TEXT_ASSET_TYPES.has(normalizedType)) {
    const contentPath = join(assetDir, 'content.md');
    writeFileSync(contentPath, `${rawResult.answer || ''}\n`, 'utf8');
    asset.local_files.push({
      kind: 'content',
      path: contentPath,
      filename: basename(contentPath)
    });
  }

  saveAsset(assetDir, asset);
  writeAssetIndex(root);
  return {
    asset,
    assetDir,
    assetPath: join(assetDir, 'asset.json'),
    indexPath: join(root, 'index.json'),
    markdownPath: join(root, 'INDEX.md'),
    downloadRequired: asset.strategy === 'notebooklm_artifact'
  };
}

export function listLearningAssets(options = {}) {
  const root = getAssetRoot(options);
  return {
    root,
    assets: loadAssets(root),
    indexPath: join(root, 'index.json'),
    markdownPath: join(root, 'INDEX.md')
  };
}

export function showLearningAsset(options = {}) {
  if (!options.assetId) throw new Error('Bitte Asset-ID angeben: learn assets show <asset-id>');
  const root = getAssetRoot(options);
  const match = findAsset(root, options.assetId);
  const contentFile = match.asset.local_files?.find(file => file.kind === 'content');
  const content = contentFile && existsSync(contentFile.path)
    ? readFileSync(contentFile.path, 'utf8')
    : null;

  return {
    ...match,
    content,
    downloadRequired: match.asset.strategy === 'notebooklm_artifact' && !hasDownloadedFile(match.asset)
  };
}

export async function downloadLearningAsset(options = {}, runner = runNotebookLmJson) {
  if (!options.assetId) throw new Error('Bitte Asset-ID angeben: learn assets download <asset-id>');
  const root = getAssetRoot(options);
  const match = findAsset(root, options.assetId);
  const asset = match.asset;
  if (!NATIVE_ASSET_TYPES.has(asset.type)) {
    throw new Error(`Asset-Typ "${asset.type}" hat keinen NotebookLM-Download.`);
  }

  const outputPath = buildDownloadOutputPath(match.assetDir, asset.type, options.format);
  const args = ['download', asset.type, '-n', options.notebookId || asset.notebook_id];
  const artifactId = asset.artifact?.id || asset.raw_result?.artifact_id || asset.raw_result?.id;
  if (artifactId) args.push('-a', artifactId);
  if (options.format) args.push('--format', options.format);
  args.push(outputPath, '--json');
  args.push(options.force ? '--force' : '--no-clobber');

  const rawResult = await runner(args);
  const now = new Date().toISOString();
  const updated = {
    ...asset,
    status: 'downloaded',
    updated_at: now,
    download: {
      command: formatNotebookLmCommand(args),
      output_path: outputPath,
      raw_result: rawResult,
      downloaded_at: now
    },
    local_files: [
      ...(asset.local_files || []).filter(file => file.kind !== 'download'),
      {
        kind: 'download',
        path: outputPath,
        filename: basename(outputPath)
      }
    ]
  };

  saveAsset(match.assetDir, updated);
  writeAssetIndex(root);
  return {
    asset: updated,
    assetDir: match.assetDir,
    outputPath,
    indexPath: join(root, 'index.json'),
    markdownPath: join(root, 'INDEX.md')
  };
}

export function printLearningAssetCreateResult(result) {
  console.log('\n=== Learning Asset ===\n');
  console.log(`Asset: ${result.asset.asset_id}`);
  console.log(`Type: ${result.asset.type}`);
  console.log(`Status: ${result.asset.status}`);
  console.log(`Path: ${result.assetPath}`);
  if (result.downloadRequired) {
    console.log(`Download: learn assets download ${result.asset.asset_id}`);
  }
}

export function printLearningAssetsList(result) {
  console.log('\n=== Learning Assets ===\n');
  console.log(`Root: ${result.root}`);
  if (result.assets.length === 0) {
    console.log('No assets found.');
    return;
  }
  for (const asset of result.assets) {
    console.log(`${asset.asset_id}  ${asset.type}  ${asset.status}  ${asset.created_at}`);
  }
}

export function printLearningAssetShowResult(result) {
  console.log('\n=== Learning Asset ===\n');
  console.log(`Asset: ${result.asset.asset_id}`);
  console.log(`Type: ${result.asset.type}`);
  console.log(`Status: ${result.asset.status}`);
  console.log(`Path: ${join(result.assetDir, 'asset.json')}`);
  if (result.content) {
    console.log('\n--- content.md ---\n');
    console.log(result.content.trimEnd());
  } else {
    console.log(`Notebook: ${result.asset.notebook_id}`);
    console.log(`Sources: ${(result.asset.selected_source_ids || []).join(', ')}`);
    if (result.asset.artifact?.id) console.log(`Artifact: ${result.asset.artifact.id}`);
    if (result.downloadRequired) console.log(`Download: learn assets download ${result.asset.asset_id}`);
  }
}

export function printLearningAssetDownloadResult(result) {
  console.log('\n=== Learning Asset Download ===\n');
  console.log(`Asset: ${result.asset.asset_id}`);
  console.log(`Status: ${result.asset.status}`);
  console.log(`File: ${result.outputPath}`);
}

export function buildTextAssetArgs({ prompt, notebookId, sourceIds }) {
  const args = ['ask', prompt, '-n', notebookId];
  for (const sourceId of sourceIds) args.push('-s', sourceId);
  args.push('--json');
  return args;
}

export function buildGenerateAssetArgs({ type, prompt, notebookId, sourceIds, format, language, wait }) {
  const args = ['generate', type];
  if (prompt) args.push(prompt);
  args.push('-n', notebookId);
  for (const sourceId of sourceIds) args.push('-s', sourceId);
  if (type === 'report' && format) args.push('--format', format);
  if (type === 'report' && language) args.push('--language', language);
  args.push(wait ? '--wait' : '--no-wait');
  args.push('--json');
  return args;
}

function resolveAssetSourceSelection({ optionSourceIds, storedSourceIds, unit, unitMapPath }) {
  if (optionSourceIds.length > 0) {
    return { sourceIds: normalizeSourceIds(optionSourceIds), context: 'explicit', unit: null };
  }

  if (unit) {
    const resolved = resolveUnitSourceIds({ unit, unitMapPath });
    return { sourceIds: resolved.sourceIds, context: 'unit', unit: resolved.unit };
  }

  return { sourceIds: normalizeSourceIds(storedSourceIds), context: 'stored', unit: null };
}

function getAssetRoot(options = {}) {
  if (options.outRoot) return resolve(options.outRoot);
  return join(dirname(dirname(DEFAULT_STATE_PATH)), options.pathId || DEFAULT_LEARNING_PATH_ID, 'assets');
}

function saveAsset(assetDir, asset) {
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(join(assetDir, 'asset.json'), `${JSON.stringify(asset, null, 2)}\n`, 'utf8');
}

function writeAssetIndex(root) {
  mkdirSync(root, { recursive: true });
  const assets = loadAssets(root);
  const index = {
    generated_at: new Date().toISOString(),
    asset_root: root,
    asset_count: assets.length,
    assets: assets.map(asset => ({
      asset_id: asset.asset_id,
      path_id: asset.path_id,
      type: asset.type,
      strategy: asset.strategy,
      status: asset.status,
      notebook_id: asset.notebook_id,
      selected_source_ids: asset.selected_source_ids,
      local_files: asset.local_files || [],
      artifact: asset.artifact || null,
      created_at: asset.created_at,
      updated_at: asset.updated_at
    }))
  };
  writeFileSync(join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  writeFileSync(join(root, 'INDEX.md'), renderAssetIndex(index), 'utf8');
  return index;
}

function loadAssets(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      try {
        return JSON.parse(readFileSync(join(root, entry.name, 'asset.json'), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
}

function findAsset(root, partialId) {
  const matches = loadAssets(root).filter(asset => String(asset.asset_id).startsWith(String(partialId)));
  if (matches.length === 0) throw new Error(`Asset nicht gefunden: ${partialId}`);
  if (matches.length > 1) throw new Error(`Asset-ID ist mehrdeutig: ${partialId}`);
  const asset = matches[0];
  return {
    asset,
    assetDir: join(root, asset.asset_id)
  };
}

function renderAssetIndex(index) {
  const lines = [
    '# Learning Asset Index',
    '',
    `Generated: ${index.generated_at}`,
    `Asset root: \`${index.asset_root}\``,
    `Assets: ${index.asset_count}`,
    '',
    '| Asset | Type | Status | Created | Local files |',
    '|-------|------|--------|---------|-------------|'
  ];

  for (const asset of index.assets) {
    const files = (asset.local_files || []).map(file => file.filename).join(', ');
    lines.push(`| \`${asset.asset_id}\` | ${asset.type} | ${asset.status} | ${asset.created_at || ''} | ${escapeMarkdownTable(files)} |`);
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildAssetPrompt({ type, prompt, unit }) {
  const custom = String(prompt || '').trim();
  if (custom) return custom;
  const unitText = unit ? ` fuer Unit ${unit.unit_number} (${unit.title})` : '';
  const defaults = {
    'study-guide': `Erstelle einen kompakten Study Guide${unitText}. Nutze nur die ausgewaehlten Quellen.`,
    summary: `Fasse die wichtigsten Konzepte${unitText} knapp und lernorientiert zusammen. Nutze nur die ausgewaehlten Quellen.`,
    exercises: `Erstelle Uebungen mit Loesungshinweisen${unitText}. Nutze nur die ausgewaehlten Quellen.`,
    'unit-plan': `Erstelle einen kurzen Lernplan${unitText}. Nutze nur die ausgewaehlten Quellen.`,
    report: `Erstelle ein lernorientiertes Report-Asset${unitText}.`,
    quiz: `Erstelle ein Quiz${unitText}.`,
    flashcards: `Erstelle Flashcards${unitText}.`
  };
  return defaults[type] || `Erzeuge ein ${type}-Asset${unitText}.`;
}

function createAssetId(type) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return `${stamp}-${type}-${randomUUID().slice(0, 8)}`;
}

function normalizeAssetType(type) {
  return String(type || '').trim().toLowerCase().replaceAll('_', '-');
}

function normalizeSourceIds(sourceIds) {
  return [...new Set((sourceIds || []).map(value => String(value).trim()).filter(Boolean))];
}

function inferArtifactStatus(result) {
  const status = result.status || result.artifact?.status || result.status_id;
  if (!status) return 'artifact_requested';
  return String(status);
}

function extractArtifactMetadata(result) {
  const artifact = result.artifact || result;
  const id = artifact.id || artifact.artifact_id;
  if (!id) return null;
  return {
    id,
    title: artifact.title || artifact.name || null,
    type: artifact.type || artifact.type_id || null,
    status: artifact.status || null,
    created_at: artifact.created_at || null
  };
}

function buildDownloadOutputPath(assetDir, type, format) {
  const ext = getDownloadExtension(type, format);
  return join(assetDir, `${type}.${ext}`);
}

function getDownloadExtension(type, format) {
  if (format) return format === 'markdown' ? 'md' : format;
  if (type === 'report') return 'md';
  if (type === 'mind-map') return 'json';
  if (type === 'data-table') return 'csv';
  if (type === 'slide-deck') return 'pdf';
  if (type === 'infographic') return 'png';
  if (type === 'audio') return 'mp3';
  if (type === 'video' || type === 'cinematic-video') return 'mp4';
  if (type === 'quiz' || type === 'flashcards') return 'json';
  return 'artifact';
}

function hasDownloadedFile(asset) {
  return (asset.local_files || []).some(file => file.kind === 'download');
}

function escapeMarkdownTable(value) {
  return String(value || '').replaceAll('|', '\\|');
}
