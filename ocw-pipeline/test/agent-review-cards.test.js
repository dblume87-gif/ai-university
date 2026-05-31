import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  formatActionInput,
  renderReviewCard,
  saveReviewCard
} from '../src/learning/agent/review-cards/index.js';

test('renderReviewCard: sichere Default-Aktion erscheint als yes', () => {
  const card = renderReviewCard({
    phase: 'Quellen pruefen',
    searched: 'Accounting fuer Fortgeschrittene',
    found: 'Ein Kurs ohne nutzbare Quellen',
    review: {
      decision: 'retry',
      reasons: ['Quellen fehlen.'],
      default_action: 'recover_sources',
      proposed_actions: [
        { action: 'recover_sources', label: 'Deep Scan starten', params: {}, safe_default: true },
        { action: 'continue_anyway', label: 'Trotzdem fortfahren', params: {}, safe_default: false }
      ]
    }
  });

  assert.match(card, /\[yes\] Deep Scan starten/);
  assert.match(card, /\[continue anyway\] Trotzdem fortfahren/);
});

test('renderReviewCard: unsichere Action wird nie als yes gerendert', () => {
  const card = renderReviewCard({
    phase: 'Kurse waehlen',
    searched: 'Kardiologie',
    found: 'Nur unsichere Treffer',
    review: {
      decision: 'ask_user',
      reasons: ['Ich brauche deine Entscheidung.'],
      default_action: null,
      proposed_actions: [
        { action: 'continue_anyway', label: 'Low-Confidence nutzen', params: {}, safe_default: false }
      ]
    }
  });

  assert.doesNotMatch(card, /\[yes\]/);
  assert.match(card, /\[continue anyway\] Low-Confidence nutzen/);
});

test('renderReviewCard: refine und broaden Labels beschreiben die echte CLI-Wirkung', () => {
  const card = renderReviewCard({
    phase: 'Kurse waehlen',
    searched: 'Corporate Strategy',
    found: 'Keine sichere Freigabe',
    review: {
      decision: 'retry',
      reasons: ['Kandidaten sind fachlich schwach.'],
      default_action: 'refine',
      proposed_actions: [
        { action: 'refine', label: 'Suche auf Corporate Strategy einschraenken', params: {}, safe_default: true },
        { action: 'broaden', label: 'Verwandte Management-Kurse einbeziehen', params: {}, safe_default: false }
      ]
    }
  });

  assert.match(card, /\[yes\] Ziel genauer eingeben/);
  assert.match(card, /\[broaden\] Breiter suchen und neue Kursliste/);
  assert.doesNotMatch(card, /Suche auf Corporate Strategy einschraenken/);
});

test('renderReviewCard: entfernt Backend-Begriffe aus der sichtbaren Card-Sprache', () => {
  const card = renderReviewCard({
    phase: 'Kurse waehlen',
    searched: 'AI Apps',
    found: 'Candidate Selector meldet Scores und Source IDs',
    review: {
      decision: 'ask_user',
      reasons: ['Candidate Selector ist unsicher wegen Scores.'],
      default_action: null,
      proposed_actions: []
    }
  });

  assert.doesNotMatch(card, /Candidate Selector/);
  assert.doesNotMatch(card, /Source ID/);
  assert.doesNotMatch(card, /Scores/);
});

test('renderReviewCard: zeigt gefundene Kurse und Auswahlhinweis', () => {
  const card = renderReviewCard({
    phase: 'Kurse waehlen',
    searched: 'strategy, business',
    found: '2 Kandidaten, aber keine sichere Freigabe',
    details: [
      '[1] unsicher: Accounting for Strategic Decisions (15-title-only-accounting) | Match: accounting | Hinweis: nur Titel passt',
      '[2] passt nicht: Principles of Microeconomics (14-01-microeconomics) | Hinweis: kein klarer Themenbezug | nicht auswaehlbar',
      'Auswahl: Tippe 1 oder 1,2 fuer die Kurse, die du bewusst uebernehmen willst.'
    ],
    review: {
      decision: 'ask_user',
      reasons: ['Ich brauche deine Entscheidung.'],
      default_action: null,
      proposed_actions: []
    }
  });

  assert.match(card, /Kurse:/);
  assert.match(card, /\[1\] unsicher: Accounting for Strategic Decisions/);
  assert.match(card, /Auswahl: Tippe 1/);
  assert.doesNotMatch(card, /thematic_fit/);
});

test('saveReviewCard: schreibt cards/<phase>.md atomar', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-card-'));
  const card = renderReviewCard({
    phase: 'Plan pruefen',
    searched: 'Learning Path',
    found: 'Rohe Titel',
    review: {
      decision: 'ask_user',
      reasons: ['Titel normalisieren.'],
      default_action: 'normalize_titles',
      proposed_actions: [
        { action: 'normalize_titles', label: 'Titel normalisieren', params: {}, safe_default: true }
      ]
    }
  });
  const result = saveReviewCard(dir, 'plan-review', card);

  assert.equal(result.artifact_path, join(dir, 'cards', 'plan-review.md'));
  assert.equal(existsSync(result.artifact_path), true);
  assert.equal(readFileSync(result.artifact_path, 'utf8'), card);
});

test('formatActionInput: action ids werden zu Tipp-Kommandos', () => {
  assert.equal(formatActionInput('continue_anyway'), 'continue anyway');
});
