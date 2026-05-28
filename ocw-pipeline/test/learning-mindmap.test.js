import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ensureMindmap,
  getLearnMindmapOptions,
  listMindmapNodes,
  matchMindmapNode
} from '../src/learning/mindmap.js';

test('getLearnMindmapOptions: liest show/match Optionen', () => {
  const options = getLearnMindmapOptions(['match', '--node', 'Rekursion', '--generate']);

  assert.equal(options.action, 'match');
  assert.equal(options.node, 'Rekursion');
  assert.equal(options.generate, true);
});

test('listMindmapNodes: liest NotebookLM-Hierarchie als Textpfade', () => {
  const nodes = listMindmapNodes(sampleMindmap());

  assert.equal(nodes.length, 5);
  assert.equal(nodes[0].text_path, 'Python Grundlagen');
  assert.equal(nodes[2].text_path, 'Python Grundlagen > Funktionen > Rekursion');
  assert.equal(nodes[2].depth, 2);
});

test('matchMindmapNode: mappt bekannten Knoten auf Unit und Sources', () => {
  const result = matchMindmapNode({
    nodeText: 'Rekursion',
    mindmap: sampleMindmap(),
    unitMap: sampleUnitMap()
  });

  assert.equal(result.status, 'matched');
  assert.equal(result.selected_candidate.unit.unit_id, '6-0001:u06');
  assert.deepEqual(result.selected_candidate.source_ids, ['s-recursion']);
});

test('matchMindmapNode: mehrdeutige Knoten liefern Kandidaten statt stillem Routing', () => {
  const result = matchMindmapNode({
    nodeText: 'Suche',
    mindmap: {
      name: 'Algorithmen',
      children: [{ name: 'Suche' }]
    },
    unitMap: {
      units: [
        { unit_id: 'u1', unit_number: 1, title: 'Lineare Suche', notebook_source_ids: ['s1'], matched_sources: [] },
        { unit_id: 'u2', unit_number: 2, title: 'Binaere Suche', notebook_source_ids: ['s2'], matched_sources: [] }
      ]
    }
  });

  assert.equal(result.status, 'ambiguous');
  assert.equal(result.selected_candidate, null);
  assert.equal(result.candidates.length, 2);
});

test('matchMindmapNode: No-Match startet keinen Chat-Kontext', () => {
  const result = matchMindmapNode({
    nodeText: 'Quantenphysik',
    mindmap: sampleMindmap(),
    unitMap: sampleUnitMap()
  });

  assert.equal(result.status, 'no_node_match');
  assert.equal(result.candidates.length, 0);
});

test('ensureMindmap: laedt vorhandene Datei ohne NotebookLM-Runner', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mindmap-load-'));
  const mindmapPath = join(dir, 'mindmap.json');
  writeFileSync(mindmapPath, JSON.stringify(sampleMindmap()));

  const result = await ensureMindmap({ mindmapPath }, async () => {
    throw new Error('runner should not be called');
  });

  assert.equal(result.status, 'loaded');
  assert.equal(result.commands.length, 0);
  assert.equal(listMindmapNodes(result.mindmap).length, 5);
});

test('ensureMindmap: generiert und downloaded fehlende Mindmap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mindmap-generate-'));
  const mindmapPath = join(dir, 'mindmap.json');
  const captured = [];

  const result = await ensureMindmap({
    mindmapPath,
    notebookId: 'n1',
    generate: true
  }, async args => {
    captured.push(args);
    if (args[0] === 'download') writeFileSync(mindmapPath, JSON.stringify(sampleMindmap()));
    return { status: 'ok' };
  });

  assert.deepEqual(captured[0], ['generate', 'mind-map', '-n', 'n1', '--wait', '--json']);
  assert.deepEqual(captured[1], ['download', 'mind-map', mindmapPath, '-n', 'n1', '--json']);
  assert.equal(result.status, 'downloaded');
  assert.ok(readFileSync(mindmapPath, 'utf8').includes('Rekursion'));
});

function sampleMindmap() {
  return {
    name: 'Python Grundlagen',
    children: [
      {
        name: 'Funktionen',
        children: [
          { name: 'Rekursion' },
          { name: 'Iteration' }
        ]
      },
      { name: 'Datenstrukturen' }
    ]
  };
}

function sampleUnitMap() {
  return {
    units: [
      {
        unit_id: '6-0001:u06',
        unit_number: 6,
        title: 'Rekursion und Dictionaries',
        notebook_source_ids: ['s-recursion'],
        matched_sources: [{ title: '6. Recursion and Dictionaries' }]
      },
      {
        unit_id: '6-0001:u04',
        unit_number: 4,
        title: 'Iteration',
        notebook_source_ids: ['s-iteration'],
        matched_sources: [{ title: '4. Iteration' }]
      }
    ]
  };
}
