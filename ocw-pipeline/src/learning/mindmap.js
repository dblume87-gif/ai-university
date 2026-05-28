import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { parseCliArgs } from '../lib/cli.js';
import { formatNotebookLmCommand, runNotebookLmJson } from '../notebooklm/cli.js';
import {
  DEFAULT_LEARNING_PATH_ID,
  DEFAULT_NOTEBOOK_ID,
  DEFAULT_STATE_PATH,
  DEFAULT_UNIT_MAP_PATH
} from './store.js';

const MINDMAP_SCHEMA = {
  stringFlags: ['--path-id', '--notebook-id', '--mindmap', '--unit-map', '--out', '--node', '--query'],
  booleanFlags: ['--generate', '--download', '--force', '--help', '-h']
};

export function getLearnMindmapOptions(args) {
  const parsed = parseCliArgs(args, MINDMAP_SCHEMA);
  return {
    action: parsed.positional[0] || 'show',
    pathId: parsed.getString('--path-id', DEFAULT_LEARNING_PATH_ID),
    notebookId: parsed.getString('--notebook-id', DEFAULT_NOTEBOOK_ID),
    mindmapPath: parsed.getString('--mindmap', getDefaultMindmapPath(parsed.getString('--path-id', DEFAULT_LEARNING_PATH_ID))),
    unitMapPath: parsed.getString('--unit-map', DEFAULT_UNIT_MAP_PATH),
    outPath: parsed.getString('--out', null),
    node: parsed.getString('--node') || parsed.getString('--query') || parsed.positional.slice(1).join(' '),
    generate: parsed.has('--generate'),
    download: parsed.has('--download'),
    force: parsed.has('--force'),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export async function ensureMindmap(options = {}, runner = runNotebookLmJson) {
  const mindmapPath = resolve(options.outPath || options.mindmapPath || getDefaultMindmapPath(options.pathId));
  if (existsSync(mindmapPath) && !options.force && !options.generate && !options.download) {
    return {
      status: 'loaded',
      mindmapPath,
      mindmap: loadMindmap(mindmapPath),
      commands: []
    };
  }

  const commands = [];
  let generatedArtifactId = null;
  if (options.force || options.generate || !existsSync(mindmapPath)) {
    const generateArgs = ['generate', 'mind-map', '-n', options.notebookId || DEFAULT_NOTEBOOK_ID, '--wait', '--json'];
    commands.push(formatNotebookLmCommand(generateArgs));
    const generateResult = await runner(generateArgs);
    generatedArtifactId = generateResult?.artifact?.id || generateResult?.id || generateResult?.artifact_id || null;
  }

  if (options.force || options.download || options.generate || !existsSync(mindmapPath)) {
    mkdirSync(dirname(mindmapPath), { recursive: true });
    const downloadArgs = ['download', 'mind-map', mindmapPath, '-n', options.notebookId || DEFAULT_NOTEBOOK_ID];
    if (generatedArtifactId) downloadArgs.push('-a', generatedArtifactId);
    downloadArgs.push('--json');
    commands.push(formatNotebookLmCommand(downloadArgs));
    await runner(downloadArgs);
    if (!existsSync(mindmapPath)) {
      throw new Error(`Mindmap wurde nicht gespeichert: ${mindmapPath}. NotebookLM-Download ggf. noch nicht abgeschlossen.`);
    }
  }

  return {
    status: 'downloaded',
    mindmapPath,
    mindmap: loadMindmap(mindmapPath),
    commands
  };
}

export function loadMindmap(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

export function listMindmapNodes(mindmap) {
  const nodes = [];

  function visit(node, ancestors = []) {
    const name = String(node?.name || '').trim();
    if (!name) return;
    const path = [...ancestors, name];
    nodes.push({
      index: nodes.length + 1,
      name,
      path,
      text_path: path.join(' > '),
      depth: path.length - 1,
      child_count: Array.isArray(node.children) ? node.children.length : 0
    });
    for (const child of node.children || []) visit(child, path);
  }

  visit(mindmap);
  return nodes;
}

export function matchMindmapNode({ nodeText, mindmap, unitMap }) {
  const nodes = listMindmapNodes(mindmap);
  const selected = selectNode(nodes, nodeText);
  if (!selected) {
    return {
      query: nodeText,
      status: 'no_node_match',
      node: null,
      candidates: [],
      message: `Mindmap-Knoten nicht gefunden: ${nodeText}`
    };
  }

  const candidates = buildCandidates(selected, unitMap)
    .sort((left, right) => right.confidence - left.confidence || left.unit.unit_number - right.unit.unit_number);
  const strong = candidates.filter(candidate => candidate.confidence >= 0.65);
  const ambiguous = strong.length !== 1 && candidates.length > 1;

  return {
    query: nodeText,
    status: candidates.length === 0 ? 'no_route_match' : ambiguous ? 'ambiguous' : 'matched',
    node: selected,
    candidates,
    selected_candidate: strong.length === 1 ? strong[0] : null,
    message: candidates.length === 0
      ? `Kein Unit-/Source-Match fuer Mindmap-Knoten: ${selected.text_path}`
      : ambiguous
        ? 'Mehrere plausible Kandidaten gefunden; bitte explizit auswaehlen.'
        : 'Mindmap-Knoten gemappt.'
  };
}

export function loadUnitMap(path = DEFAULT_UNIT_MAP_PATH) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

export function printMindmapResult(result) {
  console.log('\n=== Learning Mindmap ===\n');
  console.log(`Status: ${result.status}`);
  console.log(`Path: ${result.mindmapPath}`);
  const nodes = listMindmapNodes(result.mindmap);
  for (const node of nodes) {
    console.log(`${String(node.index).padStart(2, ' ')}  ${'  '.repeat(node.depth)}${node.name}`);
  }
}

export function printMindmapMatchResult(result) {
  console.log('\n=== Mindmap Match ===\n');
  console.log(`Status: ${result.status}`);
  console.log(result.message);
  if (result.node) console.log(`Node: ${result.node.text_path}`);
  for (const candidate of result.candidates) {
    console.log(`- ${candidate.unit.unit_id} (${candidate.confidence.toFixed(2)}): ${candidate.unit.title}`);
    console.log(`  Sources: ${candidate.source_ids.join(', ')}`);
    console.log(`  Signals: ${candidate.signals.join(', ')}`);
  }
}

export function getDefaultMindmapPath(pathId = DEFAULT_LEARNING_PATH_ID) {
  return join(dirname(DEFAULT_STATE_PATH), '..', pathId, 'mindmap.json');
}

function selectNode(nodes, nodeText) {
  const text = String(nodeText || '').trim();
  if (!text) return nodes[0] || null;
  const asIndex = Number.parseInt(text, 10);
  if (Number.isInteger(asIndex)) return nodes.find(node => node.index === asIndex) || null;
  const normalized = normalizeText(text);
  return nodes.find(node => normalizeText(node.text_path) === normalized) ||
    nodes.find(node => normalizeText(node.name) === normalized) ||
    nodes.find(node => normalizeText(node.text_path).includes(normalized)) ||
    nodes.find(node => normalizeText(node.name).includes(normalized)) ||
    null;
}

function buildCandidates(node, unitMap) {
  const units = Array.isArray(unitMap?.units) ? unitMap.units : [];
  return units
    .map(unit => scoreUnitCandidate(node, unit))
    .filter(candidate => candidate.confidence >= 0.25 && candidate.source_ids.length > 0);
}

function scoreUnitCandidate(node, unit) {
  const nodeTokens = tokenize(`${node.name} ${node.text_path}`);
  const unitTokens = tokenize(`${unit.title} ${(unit.matched_sources || []).map(source => source.title).join(' ')}`);
  const titleTokens = tokenize(unit.title);
  const sourceTokens = tokenize((unit.matched_sources || []).map(source => source.title).join(' '));
  const signals = [];
  let score = 0;

  const titleOverlap = overlapRatio(nodeTokens, titleTokens);
  if (titleOverlap > 0) {
    score += titleOverlap * 0.55;
    signals.push(`unit_title_overlap:${titleOverlap.toFixed(2)}`);
  }

  const sourceOverlap = overlapRatio(nodeTokens, sourceTokens);
  if (sourceOverlap > 0) {
    score += sourceOverlap * 0.45;
    signals.push(`source_title_overlap:${sourceOverlap.toFixed(2)}`);
  }

  const allOverlap = overlapRatio(nodeTokens, unitTokens);
  if (allOverlap > 0) score += allOverlap * 0.2;

  if (normalizeText(unit.title).includes(normalizeText(node.name)) || normalizeText(node.name).includes(normalizeText(unit.title))) {
    score += 0.35;
    signals.push('exact_or_contains_title');
  }

  return {
    unit,
    source_ids: unit.notebook_source_ids || [],
    confidence: Math.min(1, Math.round(score * 100) / 100),
    signals
  };
}

function tokenize(value) {
  return [...new Set(normalizeText(value).split(/\s+/).filter(token => token.length >= 3 && !STOPWORDS.has(token)))];
}

function overlapRatio(left, right) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const hits = left.filter(token => rightSet.has(token)).length;
  return hits / Math.min(left.length, right.length);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set([
  'und',
  'oder',
  'der',
  'die',
  'das',
  'ein',
  'eine',
  'mit',
  'for',
  'and',
  'the',
  'intro',
  'introduction'
]);
