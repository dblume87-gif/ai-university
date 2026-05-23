import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildNotebookLmAskArgs,
  getLearnChatOptions,
  runLearningChatTurn
} from '../src/learning/chat.js';
import {
  appendChatTurn,
  createInitialChatState,
  getPersistableConversationId,
  loadChatState,
  saveChatState
} from '../src/learning/store.js';

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
