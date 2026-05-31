import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runChatTurn } from '../src/workflows/chat-loop.js';

test('runChatTurn executes requested searchCourses tool and stores conversation', async () => {
  const sessionDir = mkdtempSync(join(tmpdir(), 'aiu-mvp-chat-'));
  const provider = new FakeProvider([
    {
      kind: 'tool_call',
      tool: 'searchCourses',
      input: {
        query: 'Business Strategy',
        limit: 3
      }
    },
    {
      kind: 'final',
      message: 'Ich habe passende Kurse gefunden.',
      courses: [
        {
          course_id: '15-963-advanced-strategy-spring-2008',
          title: 'Advanced Strategy',
          fit: 'Strategie-Titel und Business-Topics passen.',
          data_basis: 'title, topics, material_evidence'
        }
      ],
      data_basis: 'library.db title topics material metadata'
    }
  ]);

  const result = await runChatTurn({
    message: 'Ich will Business Strategy lernen',
    sessionDir,
    provider
  });

  assert.equal(result.tool_results.length, 1);
  assert.equal(result.tool_results[0].tool, 'searchCourses');
  assert.equal(result.assistant.role, 'assistant');
  assert.equal(result.assistant.courses[0].course_id, '15-963-advanced-strategy-spring-2008');

  const stored = readFileSync(join(sessionDir, 'conversation.jsonl'), 'utf8');
  assert.match(stored, /"role":"user"/);
  assert.match(stored, /"role":"tool"/);
  assert.match(stored, /"role":"assistant"/);
});

class FakeProvider {
  constructor(responses) {
    this.responses = responses;
  }

  async generate() {
    const response = this.responses.shift();
    if (!response) throw new Error('No fake provider response left');
    return {
      response,
      artifacts: {
        result_path: 'fake-result.json',
        events_path: 'fake-events.jsonl',
        stderr_path: 'fake-stderr.log'
      }
    };
  }
}

