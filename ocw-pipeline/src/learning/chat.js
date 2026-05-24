import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
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
  booleanFlags: ['--interactive', '--reset-conversation', '--help', '-h']
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
    interactive: parsed.has('--interactive'),
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

export async function runInteractiveLearningChat(options, dependencies = {}) {
  const readlineFactory = dependencies.createReadline || createInterface;
  const runner = dependencies.runner || runNotebookLmJson;
  const printer = dependencies.printer || printInteractiveLearningChatTurn;
  const logger = dependencies.logger || console;
  const statePath = resolve(options.statePath || DEFAULT_STATE_PATH);
  const rl = readlineFactory({ input, output });
  let resetNextTurn = Boolean(options.resetConversation);

  printInteractiveChatIntro({ ...options, statePath }, logger);

  try {
    while (true) {
      const rawMessage = await rl.question('Du: ');
      const message = String(rawMessage || '').trim();
      if (!message) continue;

      if (isExitCommand(message)) {
        logger.log('Bye.');
        break;
      }

      if (message === '/state') {
        printInteractiveChatState({ ...options, statePath }, logger);
        continue;
      }

      if (message === '/reset') {
        resetNextTurn = true;
        logger.log('Conversation wird beim naechsten Turn neu gestartet. Sources bleiben erhalten.');
        continue;
      }

      logger.log('NotebookLM denkt...');
      const result = await runLearningChatTurn({
        ...options,
        statePath,
        message,
        resetConversation: resetNextTurn
      }, runner);
      resetNextTurn = false;
      printer(result, logger);
    }
  } finally {
    rl.close();
  }
}

export function printInteractiveLearningChatTurn(result, logger = console) {
  const { turn, session } = result;
  const referenceSourceIds = [...new Set(turn.references.map(ref => ref.source_id).filter(Boolean))];

  logger.log(`\nNotebookLM: ${turn.answer || '(Keine Antwort erhalten.)'}`);
  logger.log(`Mode: ${session?.mode || 'started'}`);
  if (referenceSourceIds.length > 0) {
    logger.log(`Referenced source_ids: ${referenceSourceIds.join(', ')}`);
  }
  logger.log('');
}

function printInteractiveChatIntro(options, logger) {
  logger.log('\n=== Learning Chat Interactive ===');
  logger.log(`State: ${options.statePath}`);
  logger.log('Commands: /state, /reset, /exit\n');
}

function printInteractiveChatState(options, logger) {
  const state = loadChatState(options.statePath, {
    pathId: options.pathId,
    notebookId: options.notebookId,
    sourceIds: options.sourceIds || []
  });
  const activeSourceIds = (options.sourceIds || []).length > 0 ? options.sourceIds : state.selected_source_ids;
  const conversationId = getPersistableConversationId(state.conversation_id) || '(nicht gespeichert)';
  const sources = activeSourceIds.length > 0
    ? activeSourceIds.join(', ')
    : '(keine)';

  logger.log(`State: ${options.statePath}`);
  logger.log(`Conversation: ${conversationId}`);
  logger.log(`Sources: ${sources}`);
}

function isExitCommand(message) {
  return message === '/exit' || message === '/quit';
}
