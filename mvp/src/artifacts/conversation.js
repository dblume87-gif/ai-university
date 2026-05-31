import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_ROOT = resolve(__dirname, '../../output/chat');

export function createSession(options = {}) {
  const outputRoot = resolve(options.outputRoot || DEFAULT_OUTPUT_ROOT);
  const sessionId = options.sessionId || createSessionId();
  const sessionDir = join(outputRoot, sessionId);
  mkdirSync(sessionDir, { recursive: true });
  return {
    session_id: sessionId,
    session_dir: sessionDir,
    conversation_path: conversationPath(sessionDir)
  };
}

export function resolveSession(sessionDirOrId, options = {}) {
  if (!sessionDirOrId) return createSession(options);
  const outputRoot = resolve(options.outputRoot || DEFAULT_OUTPUT_ROOT);
  const sessionDir = sessionDirOrId.includes('/') ? resolve(sessionDirOrId) : join(outputRoot, sessionDirOrId);
  mkdirSync(sessionDir, { recursive: true });
  return {
    session_id: sessionDir.split('/').at(-1),
    session_dir: sessionDir,
    conversation_path: conversationPath(sessionDir)
  };
}

export function appendMessage(sessionDir, entry) {
  mkdirSync(sessionDir, { recursive: true });
  const record = {
    at: new Date().toISOString(),
    ...entry
  };
  appendFileSync(conversationPath(sessionDir), `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export function readConversation(sessionDir) {
  const path = conversationPath(sessionDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

export function conversationPath(sessionDir) {
  return join(sessionDir, 'conversation.jsonl');
}

function createSessionId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

