#!/usr/bin/env node
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { createSession, resolveSession } from './artifacts/conversation.js';
import { CodexCliProvider, detectCodexAuthMode } from './agent/providers/codex-cli.js';
import { runChatTurn } from './workflows/chat-loop.js';

const args = parseArgs(process.argv.slice(2));

if (args.help || args._[0] !== 'chat') {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

const session = args.new || !args.session
  ? createSession()
  : resolveSession(args.session);

const provider = new CodexCliProvider();

console.log('\n=== AI University MVP Chat ===\n');
console.log(`Session: ${session.session_dir}`);
console.log(`Codex auth: ${detectCodexAuthMode()}`);

if (args.message) {
  await runAndPrint(args.message);
} else {
  const rl = createInterface({ input, output });
  try {
    while (true) {
      const message = await rl.question('\nDu: ');
      if (!message || ['exit', 'quit', ':q'].includes(message.trim().toLowerCase())) break;
      await runAndPrint(message);
    }
  } finally {
    rl.close();
  }
}

async function runAndPrint(message) {
  const result = await runChatTurn({
    message,
    sessionDir: session.session_dir,
    provider
  });

  console.log('\nAgent:\n');
  console.log(result.assistant.content);
  if (result.assistant.courses?.length > 0) {
    console.log('\nKurse:');
    for (const course of result.assistant.courses) {
      console.log(`- ${course.course_id} | ${course.title}`);
      console.log(`  ${course.fit}`);
      if (course.data_basis) console.log(`  Grundlage: ${course.data_basis}`);
    }
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--new') parsed.new = true;
    else if (arg === '--session') parsed.session = argv[++index];
    else if (arg === '--message' || arg === '-m') parsed.message = argv[++index];
    else parsed._.push(arg);
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node src/cli.js chat --new --message "Ich will Supply Chain Management lernen"
  node src/cli.js chat --session <session-dir>

Options:
  --new              Start a new chat session
  --session <path>   Continue an existing session directory or id
  --message, -m      Run one chat turn non-interactively
`);
}

