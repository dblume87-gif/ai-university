import { resolve } from 'path';
import { parseCliArgs } from '../lib/cli.js';
import { formatNotebookLmCommand, runNotebookLmJson } from '../notebooklm/cli.js';
import {
  DEFAULT_LEARNING_PATH_ID,
  DEFAULT_NOTEBOOK_ID,
  DEFAULT_STATE_PATH,
  appendChatTurn,
  getPersistableConversationId,
  loadChatState,
  saveChatState
} from './store.js';

const LEARN_CHAT_SCHEMA = {
  stringFlags: ['--message', '--notebook-id', '--path-id', '--state', '--source', '--sources'],
  booleanFlags: ['--reset-conversation', '--help', '-h']
};

export function getLearnChatOptions(args) {
  const parsed = parseCliArgs(args, LEARN_CHAT_SCHEMA);
  const sourceIds = [
    ...parsed.getAll('--source', []),
    ...(parsed.getList('--sources', []) || [])
  ].map(value => String(value).trim()).filter(Boolean);

  return {
    message: parsed.getString('--message') || parsed.positional.join(' '),
    notebookId: parsed.getString('--notebook-id', DEFAULT_NOTEBOOK_ID),
    pathId: parsed.getString('--path-id', DEFAULT_LEARNING_PATH_ID),
    sourceIds,
    statePath: parsed.getString('--state', DEFAULT_STATE_PATH),
    resetConversation: parsed.has('--reset-conversation'),
    help: parsed.has('--help') || parsed.has('-h')
  };
}

export function buildNotebookLmAskArgs({ message, notebookId, sourceIds, conversationId }) {
  if (!message) throw new Error('Bitte eine Frage mit --message "..." angeben.');
  if (!notebookId) throw new Error('Bitte --notebook-id angeben.');
  if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
    throw new Error('Bitte mindestens eine Source mit --source <source-id> angeben.');
  }

  const args = ['ask', message, '-n', notebookId];
  for (const sourceId of sourceIds) args.push('-s', sourceId);
  if (getPersistableConversationId(conversationId)) args.push('-c', conversationId);
  args.push('--json');
  return args;
}

export async function runLearningChatTurn(options, runner = runNotebookLmJson) {
  const statePath = resolve(options.statePath || DEFAULT_STATE_PATH);
  const state = loadChatState(statePath, {
    pathId: options.pathId,
    notebookId: options.notebookId,
    sourceIds: options.sourceIds || []
  });
  const optionSourceIds = options.sourceIds || [];
  const sourceIds = optionSourceIds.length > 0 ? optionSourceIds : state.selected_source_ids;
  const conversationId = options.resetConversation ? null : state.conversation_id;
  const continuedConversation = Boolean(getPersistableConversationId(conversationId));
  const sourceContext = optionSourceIds.length > 0 ? 'explicit' : 'stored';
  const askArgs = buildNotebookLmAskArgs({
    message: options.message,
    notebookId: options.notebookId || state.notebook_id,
    sourceIds,
    conversationId
  });
  const result = await runner(askArgs);
  const turn = {
    question: options.message,
    answer: result.answer || '',
    notebook_id: options.notebookId || state.notebook_id,
    selected_source_ids: sourceIds,
    conversation_id: result.conversation_id || null,
    references: result.references || [],
    command: formatNotebookLmCommand(askArgs),
    raw_result: result
  };
  const nextState = appendChatTurn(state, turn);
  saveChatState(statePath, nextState);

  return {
    state: nextState,
    statePath,
    turn,
    session: {
      mode: continuedConversation ? 'continued' : 'started',
      source_context: sourceContext
    }
  };
}

export function printLearningChatResult(result) {
  const { turn, statePath, session } = result;
  const referenceSourceIds = [...new Set(turn.references.map(ref => ref.source_id).filter(Boolean))];

  console.log('\n=== Learning Chat ===\n');
  console.log(turn.answer || '(Keine Antwort erhalten.)');
  console.log('\n---');
  console.log(`Mode: ${session?.mode || 'started'}`);
  console.log(`State: ${statePath}`);
  console.log(`Conversation: ${getPersistableConversationId(turn.conversation_id) || '(nicht gespeichert)'}`);
  console.log(`Sources (${session?.source_context || 'explicit'}): ${turn.selected_source_ids.join(', ')}`);
  if (referenceSourceIds.length > 0) {
    console.log(`Referenced source_ids: ${referenceSourceIds.join(', ')}`);
  }
}
