import { createRequire } from 'module';
import { appendFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const requireFromPipeline = createRequire(new URL('../../ocw-pipeline/package.json', import.meta.url));

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(process.env.SPIKE_LIBRARY_DB || `${__dirname}/../data/library.db`);
const toolLogPath = process.env.SPIKE_TOOL_LOG ? resolve(process.env.SPIKE_TOOL_LOG) : null;
const debugLogPath = process.env.SPIKE_DEBUG_LOG ? resolve(process.env.SPIKE_DEBUG_LOG) : null;
let buffer = Buffer.alloc(0);
let framing = 'headers';

process.stdin.on('data', chunk => {
  debugLog({ event: 'stdin_chunk', text: chunk.toString('utf8') });
  buffer = Buffer.concat([buffer, chunk]);
  if (!buffer.toString('utf8', 0, Math.min(buffer.length, 32)).startsWith('Content-Length:')) {
    framing = 'jsonl';
  }
  readMessages();
});

function readMessages() {
  if (framing === 'jsonl') {
    readJsonlMessages();
    return;
  }

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;

    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const length = Number(match[1]);
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + length;
    if (buffer.length < messageEnd) return;

    const raw = buffer.slice(messageStart, messageEnd).toString('utf8');
    buffer = buffer.slice(messageEnd);
    handleMessage(JSON.parse(raw)).catch(error => {
      if (raw.includes('"id"')) {
        const id = safeJsonParse(raw)?.id ?? null;
        send({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } });
      }
    });
  }
}

function readJsonlMessages() {
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) return;
    const raw = buffer.slice(0, newline).toString('utf8').trim();
    buffer = buffer.slice(newline + 1);
    if (!raw) continue;
    handleMessage(JSON.parse(raw)).catch(error => {
      const id = safeJsonParse(raw)?.id ?? null;
      if (id !== null) send({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } });
    });
  }
}

async function handleMessage(message) {
  debugLog({ event: 'message', message });
  if (!message || !message.method) return;

  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: message.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'aiu-course-search-spike', version: '0.0.0' }
      }
    });
    return;
  }

  if (message.method === 'notifications/initialized') return;

  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        tools: [
          {
            name: 'search_courses',
            description: 'Search MIT OCW courses by a query string against title and topics in library.db.',
            inputSchema: {
              type: 'object',
              additionalProperties: false,
              required: ['query'],
              properties: {
                query: { type: 'string' },
                limit: { type: 'integer', minimum: 1, maximum: 5 }
              }
            }
          }
        ]
      }
    });
    return;
  }

  if (message.method === 'tools/call') {
    const args = message.params?.arguments || {};
    const result = searchCourses(args.query, args.limit);
    logToolCall(args, result);
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result
      }
    });
    return;
  }

  if (message.id !== undefined) {
    send({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: `Unsupported method: ${message.method}` }
    });
  }
}

function send(message) {
  debugLog({ event: 'send', message });
  const body = JSON.stringify(message);
  if (framing === 'jsonl') {
    process.stdout.write(`${body}\n`);
    return;
  }
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function searchCourses(query, limit = 5) {
  if (!existsSync(dbPath)) throw new Error(`library.db not found: ${dbPath}`);
  const terms = tokenize(query).slice(0, 8);
  const rows = readRows();
  const scored = rows
    .map(row => {
      const title = String(row.title || '');
      const topics = String(row.topics || '');
      const titleTokens = new Set(tokenize(title));
      const topicTokens = new Set(tokenize(topics));
      const titleHits = terms.filter(term => titleTokens.has(term));
      const topicHits = terms.filter(term => topicTokens.has(term));
      const score = titleHits.length * 3 + topicHits.length;
      return {
        row,
        score,
        titleHits,
        topicHits
      };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.row.title.localeCompare(right.row.title))
    .slice(0, Math.min(Number(limit) || 5, 5));

  return {
    query,
    data_basis: 'library.db courses table: title and topics LIKE/token search',
    courses: scored.map(item => ({
      course_id: item.row.course_id,
      title: item.row.title,
      topics: parseTopics(item.row.topics),
      matched_title_terms: item.titleHits,
      matched_topic_terms: item.topicHits
    }))
  };
}

function readRows() {
  const Database = requireFromPipeline('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db.prepare('SELECT course_id, title, topics FROM courses').all();
  } finally {
    db.close();
  }
}

function tokenize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token));
}

function parseTopics(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.flat(Infinity).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function logToolCall(args, result) {
  if (!toolLogPath) return;
  appendFileSync(toolLogPath, `${JSON.stringify({
    called_at: new Date().toISOString(),
    tool: 'search_courses',
    args,
    course_ids: result.courses.map(course => course.course_id)
  })}\n`, 'utf8');
}

function debugLog(entry) {
  if (!debugLogPath) return;
  appendFileSync(debugLogPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, 'utf8');
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'mit',
  'course',
  'courses',
  'find',
  'suche',
  'kurse',
  'gute',
  'good'
]);
