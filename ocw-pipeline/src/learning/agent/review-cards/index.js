import { join, resolve } from 'path';
import { atomicWriteArtifact } from '../run-state/index.js';

const BACKEND_TERMS = [
  /Candidate Selector/gi,
  /Source IDs?/gi,
  /Scores?/gi,
  /thematic_fit/gi,
  /agent_state\.json/gi
];

export function renderReviewCard({
  phase,
  searched,
  found,
  review,
  decisionText = null,
  details = []
}) {
  const title = sanitizeText(phase || 'Review');
  const decision = sanitizeText(decisionText || review?.reasons?.[0] || decisionLabel(review?.decision));
  const lines = [
    `+-- ${title} ${'-'.repeat(Math.max(0, 58 - title.length))}+`,
    formatLine('Gesucht:', searched || '-'),
    formatLine('Gefunden:', found || '-'),
    formatLine('Entscheidung:', decision || '-'),
    ...formatActionLines(review),
    '+'.padEnd(64, '-') + '+'
  ];
  return `${[...lines, ...formatDetailLines(details)].join('\n')}\n`;
}

export function saveReviewCard(runDir, phaseSlug, cardText) {
  return atomicWriteArtifact(join(resolve(runDir), 'cards', `${phaseSlug}.md`), cardText);
}

export function formatActionInput(action) {
  return String(action || '').replaceAll('_', ' ');
}

function formatActionLines(review = {}) {
  const actions = review.proposed_actions || [];
  if (actions.length === 0) return [formatLine('Du kannst:', '-')];
  const rendered = actions.map(action => renderAction(action, review.default_action));
  return rendered.map((item, index) => formatLine(index === 0 ? 'Du kannst:' : '', item));
}

function formatDetailLines(details = []) {
  const lines = details
    .map(item => sanitizeText(item))
    .filter(Boolean)
    .map(item => `  ${truncate(item, 110)}`);
  if (lines.length === 0) return [];
  return ['', 'Kurse:', ...lines];
}

function renderAction(action, defaultAction) {
  if (action.action === defaultAction && action.safe_default) {
    return `[yes] ${sanitizeText(action.label)}`;
  }
  return `[${formatActionInput(action.action)}] ${sanitizeText(action.label)}`;
}

function formatLine(label, value) {
  const labelText = label ? label.padEnd(13, ' ') : ''.padEnd(13, ' ');
  const text = `${labelText}${sanitizeText(value)}`;
  return `| ${truncate(text, 60).padEnd(60, ' ')} |`;
}

function decisionLabel(decision) {
  if (decision === 'accepted') return 'Das Ergebnis ist gut genug.';
  if (decision === 'retry') return 'Es gibt eine konkrete Verbesserung.';
  if (decision === 'ask_user') return 'Ich brauche deine Entscheidung.';
  if (decision === 'stop') return 'Hier gibt es keinen sinnvollen Weg weiter.';
  return 'Review abgeschlossen.';
}

function sanitizeText(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  for (const pattern of BACKEND_TERMS) text = text.replace(pattern, '').trim();
  return text;
}

function truncate(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}
