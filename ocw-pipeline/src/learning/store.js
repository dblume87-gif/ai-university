import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = join(__dirname, '../..');
const REPO_ROOT = join(PIPELINE_ROOT, '..');

export const DEFAULT_LEARNING_PATH_ID = 'v0-mit-60001';
export const DEFAULT_COURSE_ID = '6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016';
export const DEFAULT_NOTEBOOK_ID = 'e9b29f80-838e-43d3-989d-e3416658b76a';
export const DEFAULT_STATE_PATH = join(PIPELINE_ROOT, 'output', 'learning-paths', DEFAULT_LEARNING_PATH_ID, 'chat_state.json');
export const DEFAULT_UNIT_MAP_PATH = join(PIPELINE_ROOT, 'output', 'learning-paths', DEFAULT_LEARNING_PATH_ID, 'unit_source_map.json');
export const DEFAULT_COURSE_UNITS_PATH = join(PIPELINE_ROOT, 'output', 'notebooklm', DEFAULT_COURSE_ID, 'course_units.json');
export const DEFAULT_SOURCE_LIST_PATH = join(REPO_ROOT, 'docs', 'spike-artifacts', 'source-list.json');

export function createInitialChatState(options = {}) {
  return {
    path_id: options.pathId || DEFAULT_LEARNING_PATH_ID,
    notebook_id: options.notebookId || DEFAULT_NOTEBOOK_ID,
    selected_source_ids: normalizeSourceIds(options.sourceIds || []),
    conversation_id: null,
    last_step: 'chat_ready',
    turns: []
  };
}

export function loadChatState(statePath, options = {}) {
  try {
    const raw = readFileSync(statePath, 'utf8');
    return normalizeChatState(JSON.parse(raw), options);
  } catch (err) {
    if (err.code === 'ENOENT') return createInitialChatState(options);
    throw err;
  }
}

export function saveChatState(statePath, state) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function appendChatTurn(state, turn) {
  const nextState = normalizeChatState(state);
  const nextTurn = normalizeTurn(turn, nextState.turns.length + 1);
  const conversationId = getPersistableConversationId(nextTurn.conversation_id);

  nextState.notebook_id = nextTurn.notebook_id || nextState.notebook_id;
  nextState.selected_source_ids = normalizeSourceIds(nextTurn.selected_source_ids);
  nextState.last_step = 'chat_ready';
  if (conversationId) nextState.conversation_id = conversationId;
  nextState.turns.push(nextTurn);

  return nextState;
}

export function getPersistableConversationId(value) {
  if (!value || value === 'new') return null;
  return String(value);
}

function normalizeChatState(state, options = {}) {
  const initial = createInitialChatState(options);
  return {
    ...initial,
    ...state,
    path_id: state?.path_id || initial.path_id,
    notebook_id: state?.notebook_id || initial.notebook_id,
    selected_source_ids: normalizeSourceIds(state?.selected_source_ids || initial.selected_source_ids),
    conversation_id: getPersistableConversationId(state?.conversation_id),
    turns: Array.isArray(state?.turns) ? state.turns : []
  };
}

function normalizeTurn(turn, sequence) {
  return {
    sequence,
    created_at: new Date().toISOString(),
    ...turn,
    selected_source_ids: normalizeSourceIds(turn.selected_source_ids),
    references: Array.isArray(turn.references) ? turn.references : []
  };
}

function normalizeSourceIds(sourceIds) {
  return [...new Set((sourceIds || []).map(value => String(value).trim()).filter(Boolean))];
}
