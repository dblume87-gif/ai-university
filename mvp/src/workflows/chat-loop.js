import { searchCourses } from '../tools/ocw-library.js';
import { appendMessage, readConversation } from '../artifacts/conversation.js';

export async function runChatTurn(options = {}) {
  const {
    message,
    sessionDir,
    provider,
    dbPath,
    maxSteps = 3
  } = options;

  if (!message) throw new Error('runChatTurn requires message');
  if (!sessionDir) throw new Error('runChatTurn requires sessionDir');
  if (!provider?.generate) throw new Error('runChatTurn requires provider.generate');

  appendMessage(sessionDir, {
    role: 'user',
    content: message
  });

  const toolResults = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const prompt = buildAgentPrompt(readConversation(sessionDir));
    const { response, artifacts } = await provider.generate({ prompt, sessionDir });

    if (response.kind === 'tool_call') {
      if (response.tool !== 'searchCourses') throw new Error(`Unsupported tool: ${response.tool}`);
      const result = searchCourses({
        ...response.input,
        dbPath
      });
      const record = appendMessage(sessionDir, {
        role: 'tool',
        tool: 'searchCourses',
        input: response.input,
        result,
        provider_artifacts: artifacts
      });
      toolResults.push(record);
      continue;
    }

    if (response.kind === 'final') {
      const assistant = appendMessage(sessionDir, {
        role: 'assistant',
        content: response.message || '',
        courses: response.courses || [],
        data_basis: response.data_basis || null,
        provider_artifacts: artifacts
      });
      return {
        assistant,
        tool_results: toolResults,
        conversation: readConversation(sessionDir)
      };
    }

    throw new Error(`Unsupported provider response kind: ${response.kind}`);
  }

  throw new Error(`Agent did not produce a final response within ${maxSteps} steps`);
}

export function buildAgentPrompt(conversation) {
  return [
    'You are the AI University MVP course search agent.',
    'You help the user find MIT OCW courses from a local library.',
    '',
    'You have exactly one available tool, but you cannot call it directly.',
    'To request it, return JSON with kind="tool_call", tool="searchCourses", and input {query, level, language, limit}.',
    'After a tool result appears in the conversation, return kind="final" with message, courses, and data_basis.',
    '',
    'Rules:',
    '- Use searchCourses before recommending courses unless the user is only asking about the current session.',
    '- For "breiter", "mehr", "weitere Optionen", or similar requests, call searchCourses again with a broader or different query.',
    '- Base fit judgments only on tool evidence: title, topics, material_evidence, fit_evidence.',
    '- Mention weak_signals when a result looks generic or should be treated cautiously.',
    '- Do not invent course IDs.',
    '- Reply in German unless the user asks otherwise.',
    '',
    'Conversation JSONL:',
    JSON.stringify(conversation, null, 2)
  ].join('\n');
}

