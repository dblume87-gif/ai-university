import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildNotebookLmAskArgs,
  getLearnChatOptions,
  runInteractiveLearningChat,
  runLearningChatTurn
} from '../src/learning/chat.js';
import {
  appendChatTurn,
  createInitialChatState,
  getPersistableConversationId,
  loadChatState,
  saveChatState
} from '../src/learning/store.js';
import {
  buildUnitSourceMap,
  inferLectureNumber
} from '../src/learning/unit-map.js';

test('getLearnChatOptions: akzeptiert wiederholte --source Flags', () => {
  const options = getLearnChatOptions([
    '--message', 'Was ist Rekursion?',
    '--source', 's1',
    '--source', 's2',
    '--sources', 's3,s4'
  ]);

  assert.equal(options.message, 'Was ist Rekursion?');
  assert.deepEqual(options.sourceIds, ['s1', 's2', 's3', 's4']);
});

test('getLearnChatOptions: erkennt interaktiven Modus', () => {
  const options = getLearnChatOptions(['--interactive']);

  assert.equal(options.interactive, true);
});

test('getLearnChatOptions: akzeptiert Unit und Unit-Map', () => {
  const options = getLearnChatOptions(['--unit', '6', '--unit-map', '/tmp/unit-map.json']);

  assert.equal(options.unit, '6');
  assert.equal(options.unitMapPath, '/tmp/unit-map.json');
});

test('inferLectureNumber: erkennt NotebookLM Source-Titel und PDF-Namen', () => {
  assert.equal(inferLectureNumber('1. What is Computation?'), 1);
  assert.equal(inferLectureNumber('MIT6_0001F16_Lec6.pdf'), 6);
});

test('buildUnitSourceMap: mappt ready Sources auf stabile Unit IDs', () => {
  const unitMap = buildUnitSourceMap({
    pathId: 'v0-test',
    courseId: '6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016',
    notebookId: 'n1',
    courseUnits: {
      units: [
        { unit_number: 6, title: 'Recursion, Dictionaries' },
        { unit_number: 7, title: 'Testing' }
      ]
    },
    sourceList: {
      sources: [
        { id: 's-youtube', title: '6. Recursion and Dictionaries', type: 'SourceType.YOUTUBE', status: 'ready', index: 1 },
        { id: 's-pdf', title: 'MIT6_0001F16_Lec6.pdf', type: 'SourceType.PDF', status: 'ready', index: 2 },
        { id: 's-processing', title: '7. Testing', type: 'SourceType.YOUTUBE', status: 'processing', index: 3 }
      ]
    }
  });

  assert.equal(unitMap.summary.ready_source_count, 2);
  assert.deepEqual(unitMap.units[0].notebook_source_ids, ['s-youtube', 's-pdf']);
  assert.equal(unitMap.units[0].unit_id, '6-0001:u06');
  assert.deepEqual(unitMap.units[1].warnings, ['no_ready_notebook_sources']);
});

test('buildNotebookLmAskArgs: baut source-gefilterten Ask ohne Conversation', () => {
  const args = buildNotebookLmAskArgs({
    message: 'Was ist Rekursion?',
    notebookId: 'n1',
    sourceIds: ['s1', 's2']
  });

  assert.deepEqual(args, ['ask', 'Was ist Rekursion?', '-n', 'n1', '-s', 's1', '-s', 's2', '--json']);
});

test('buildNotebookLmAskArgs: nutzt nur echte Conversation-IDs', () => {
  const withUuid = buildNotebookLmAskArgs({
    message: 'Und einfacher?',
    notebookId: 'n1',
    sourceIds: ['s1'],
    conversationId: 'b7b5e1f3-2356-4265-b07a-154d1ab5d61c'
  });
  const withNew = buildNotebookLmAskArgs({
    message: 'Und einfacher?',
    notebookId: 'n1',
    sourceIds: ['s1'],
    conversationId: 'new'
  });

  assert.ok(withUuid.includes('-c'));
  assert.ok(withUuid.includes('b7b5e1f3-2356-4265-b07a-154d1ab5d61c'));
  assert.ok(!withNew.includes('-c'));
});

test('appendChatTurn: speichert Conversation-ID und deduplizierte Sources', () => {
  const state = createInitialChatState({ sourceIds: ['old'] });
  const next = appendChatTurn(state, {
    question: 'Q',
    answer: 'A',
    notebook_id: 'n1',
    selected_source_ids: ['s1', 's1', 's2'],
    conversation_id: 'c1',
    references: [{ source_id: 's1', citation_number: 1 }]
  });

  assert.equal(next.conversation_id, 'c1');
  assert.deepEqual(next.selected_source_ids, ['s1', 's2']);
  assert.equal(next.turns.length, 1);
  assert.equal(next.turns[0].sequence, 1);
});

test('appendChatTurn: ignoriert conversation_id new', () => {
  const state = createInitialChatState();
  const next = appendChatTurn(state, {
    question: 'Q',
    answer: 'A',
    notebook_id: 'n1',
    selected_source_ids: ['s1'],
    conversation_id: 'new'
  });

  assert.equal(next.conversation_id, null);
  assert.equal(getPersistableConversationId('new'), null);
});

test('loadChatState/saveChatState: initialisiert fehlenden Store und persistiert JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-store-'));
  const path = join(dir, 'chat_state.json');
  const initial = loadChatState(path, { pathId: 'p1', notebookId: 'n1', sourceIds: ['s1'] });

  assert.equal(initial.path_id, 'p1');
  assert.equal(initial.notebook_id, 'n1');
  assert.deepEqual(initial.selected_source_ids, ['s1']);

  saveChatState(path, initial);
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(saved.path_id, 'p1');
});

test('runLearningChatTurn: ruft Runner mit gespeicherter Conversation auf und schreibt Store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-chat-'));
  const statePath = join(dir, 'chat_state.json');
  saveChatState(statePath, {
    ...createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s1'] }),
    conversation_id: 'c-existing'
  });

  let capturedArgs;
  const result = await runLearningChatTurn({
    message: 'Was ist Rekursion?',
    notebookId: 'n1',
    pathId: 'p1',
    sourceIds: ['s1'],
    statePath,
    resetConversation: false
  }, async args => {
    capturedArgs = args;
    return {
      answer: 'Antwort [1]',
      conversation_id: 'c-next',
      references: [{ source_id: 's1', citation_number: 1 }]
    };
  });

  assert.deepEqual(capturedArgs, ['ask', 'Was ist Rekursion?', '-n', 'n1', '-s', 's1', '-c', 'c-existing', '--json']);
  assert.equal(result.state.conversation_id, 'c-next');
  assert.equal(result.state.turns.length, 1);

  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(saved.conversation_id, 'c-next');
  assert.equal(saved.turns[0].answer, 'Antwort [1]');
});

test('runLearningChatTurn: Folgefrage ohne Sources nutzt gespeicherte Conversation und Sources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-followup-'));
  const statePath = join(dir, 'chat_state.json');
  saveChatState(statePath, {
    ...createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s-stored'] }),
    conversation_id: 'c-existing'
  });

  let capturedArgs;
  const result = await runLearningChatTurn({
    message: 'Ich rate: ohne Base Case laeuft sie endlos?',
    notebookId: 'n1',
    pathId: 'p1',
    sourceIds: [],
    statePath,
    resetConversation: false
  }, async args => {
    capturedArgs = args;
    return {
      answer: 'Genau [1]',
      conversation_id: 'c-existing',
      references: [{ source_id: 's-stored', citation_number: 1 }]
    };
  });

  assert.deepEqual(capturedArgs, [
    'ask',
    'Ich rate: ohne Base Case laeuft sie endlos?',
    '-n',
    'n1',
    '-s',
    's-stored',
    '-c',
    'c-existing',
    '--json'
  ]);
  assert.equal(result.session.mode, 'continued');
  assert.equal(result.session.source_context, 'stored');
});

test('runLearningChatTurn: Unit nutzt gemappte NotebookLM Sources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-unit-chat-'));
  const statePath = join(dir, 'chat_state.json');
  const unitMapPath = join(dir, 'unit_source_map.json');
  writeFileSync(unitMapPath, JSON.stringify({
    units: [
      {
        unit_id: '6-0001:u06',
        unit_number: 6,
        title: 'Recursion, Dictionaries',
        notebook_source_ids: ['s-youtube', 's-pdf']
      }
    ]
  }));

  let capturedArgs;
  const result = await runLearningChatTurn({
    message: 'Was ist Rekursion?',
    notebookId: 'n1',
    pathId: 'p1',
    sourceIds: [],
    unit: '6',
    unitMapPath,
    statePath,
    resetConversation: false
  }, async args => {
    capturedArgs = args;
    return {
      answer: 'Antwort',
      conversation_id: 'c1',
      references: [{ source_id: 's-youtube', citation_number: 1 }]
    };
  });

  assert.deepEqual(capturedArgs, ['ask', 'Was ist Rekursion?', '-n', 'n1', '-s', 's-youtube', '-s', 's-pdf', '--json']);
  assert.equal(result.session.source_context, 'unit');
  assert.equal(result.session.unit.unit_id, '6-0001:u06');
});

test('runLearningChatTurn: explizite Sources ueberschreiben Unit', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-unit-explicit-'));
  const statePath = join(dir, 'chat_state.json');
  const unitMapPath = join(dir, 'unit_source_map.json');
  writeFileSync(unitMapPath, JSON.stringify({
    units: [
      {
        unit_id: '6-0001:u06',
        unit_number: 6,
        title: 'Recursion, Dictionaries',
        notebook_source_ids: ['s-youtube', 's-pdf']
      }
    ]
  }));

  let capturedArgs;
  const result = await runLearningChatTurn({
    message: 'Was ist Rekursion?',
    notebookId: 'n1',
    pathId: 'p1',
    sourceIds: ['s-explicit'],
    unit: '6',
    unitMapPath,
    statePath,
    resetConversation: false
  }, async args => {
    capturedArgs = args;
    return {
      answer: 'Antwort',
      conversation_id: 'c1',
      references: []
    };
  });

  assert.deepEqual(capturedArgs, ['ask', 'Was ist Rekursion?', '-n', 'n1', '-s', 's-explicit', '--json']);
  assert.equal(result.session.source_context, 'explicit');
  assert.equal(result.session.unit, null);
});

test('runLearningChatTurn: unbekannte Unit bricht vor Runner ab', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-unit-missing-'));
  const unitMapPath = join(dir, 'unit_source_map.json');
  writeFileSync(unitMapPath, JSON.stringify({
    units: [{ unit_id: '6-0001:u06', unit_number: 6, title: 'Recursion', notebook_source_ids: ['s1'] }]
  }));

  await assert.rejects(
    () => runLearningChatTurn({
      message: 'Q',
      notebookId: 'n1',
      pathId: 'p1',
      sourceIds: [],
      unit: '99',
      unitMapPath,
      statePath: join(dir, 'chat_state.json')
    }, async () => {
      throw new Error('runner should not be called');
    }),
    /Unbekannte Unit "99"/
  );
});

test('runInteractiveLearningChat: ruft pro Eingabe Runner mit derselben State-Datei auf', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-interactive-'));
  const statePath = join(dir, 'chat_state.json');
  saveChatState(statePath, createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s1'] }));

  const questions = ['Was ist Rekursion?', 'Und einfacher?', '/exit'];
  const capturedArgs = [];
  const logs = [];

  await runInteractiveLearningChat({
    notebookId: 'n1',
    pathId: 'p1',
    sourceIds: [],
    statePath
  }, {
    createReadline: () => fakeReadline(questions),
    runner: async args => {
      capturedArgs.push(args);
      return {
        answer: `Antwort ${capturedArgs.length}`,
        conversation_id: 'c1',
        references: [{ source_id: 's1', citation_number: 1 }]
      };
    },
    logger: fakeLogger(logs)
  });

  assert.equal(capturedArgs.length, 2);
  assert.deepEqual(capturedArgs[0], ['ask', 'Was ist Rekursion?', '-n', 'n1', '-s', 's1', '--json']);
  assert.deepEqual(capturedArgs[1], ['ask', 'Und einfacher?', '-n', 'n1', '-s', 's1', '-c', 'c1', '--json']);

  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(saved.turns.length, 2);
  assert.equal(saved.conversation_id, 'c1');
});

test('runInteractiveLearningChat: ignoriert leere Eingaben und behandelt Commands ohne Runner', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'learning-interactive-commands-'));
  const statePath = join(dir, 'chat_state.json');
  saveChatState(statePath, {
    ...createInitialChatState({ pathId: 'p1', notebookId: 'n1', sourceIds: ['s1'] }),
    conversation_id: 'c-existing'
  });

  const questions = ['', '   ', '/state', '/reset', 'Neue Frage', '/exit'];
  const capturedArgs = [];
  const logs = [];

  await runInteractiveLearningChat({
    notebookId: 'n1',
    pathId: 'p1',
    sourceIds: [],
    statePath
  }, {
    createReadline: () => fakeReadline(questions),
    runner: async args => {
      capturedArgs.push(args);
      return {
        answer: 'Antwort',
        conversation_id: 'c-next',
        references: []
      };
    },
    logger: fakeLogger(logs)
  });

  assert.equal(capturedArgs.length, 1);
  assert.deepEqual(capturedArgs[0], ['ask', 'Neue Frage', '-n', 'n1', '-s', 's1', '--json']);
  assert.ok(logs.some(line => line.includes('Conversation: c-existing')));
  assert.ok(logs.some(line => line.includes('Conversation wird beim naechsten Turn neu gestartet.')));
});

function fakeReadline(questions) {
  let index = 0;
  return {
    async question() {
      return questions[index++];
    },
    close() {}
  };
}

function fakeLogger(logs) {
  return {
    log(message = '') {
      logs.push(String(message));
    }
  };
}
