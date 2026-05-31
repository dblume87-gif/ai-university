# 06 Review-Cards: Terminal-Rendering

Status: Backlog
MVP-Modul: review-cards
Spec: [agent-orchestration-mvp-spec.md](../../draft/agent-orchestration-mvp-spec.md), Abschnitt 6, 8
Parallelisierbar: ja, nach Ticket 01; parallel zu Tickets 03/04/05

## Ziel

Pro Gate eine kompakte, userfaehige Terminal-Card, die die Reviewer-Decision in
Produktsprache rendert und die Default-/Safe-Action-Regel sichtbar spiegelt.
Backend-Begriffe bleiben in den Artefakten, nicht in der Card.

## Scope

- Card mit vier Zeilen-Bloecken (Gesucht / Gefunden / Entscheidung / Du kannst):
  ```text
  ┌─ Kurse waehlen ───────────────────────────────────────────┐
  │ Gesucht:    Kardiologie fuer Anfaenger (Einstieg, Deutsch) │
  │ Gefunden:   3 Kurse — bester Treffer thematisch schwach    │
  │ Entscheidung: Ich bin unsicher, ob das wirklich passt.     │
  │ Du kannst:  [broaden] breiter suchen  [refine] schaerfen   │
  │             [continue anyway] nutzen  [quit] abbrechen     │
  └────────────────────────────────────────────────────────────┘
  ```
- Jede Card-Zeile traegt im Hintergrund ihr `action` und `safe_default`-Flag.
- Die sichere Default-Aktion ist als `[yes]` markiert; riskante Aktionen werden
  mit ihrem **vollen Namen** gerendert (z.B. `[continue anyway]`), nicht via
  `yes` erreichbar.
- Hat eine Card keine sichere Default-Aktion (`default_action: null`), wird kein
  `[yes]` angeboten, sondern nur die voll zu tippenden Optionen.
- Card immer aus den Provider-Daten gerendert (`default_action`,
  `proposed_actions[].safe_default`), nie aus hartkodierten Annahmen.
- Gerenderte Cards werden als `cards/<phase>.md` abgelegt (Persistenz ueber
  Ticket 05).

## Nicht im Scope

- Die Eingabe-Interpretation und der Action-Dispatch (Ticket 07).
- Die Reviewer-Decisions selbst (Tickets 03/04).
- State-Persistenz (Ticket 05).

## Abhaengigkeiten

- Ticket 01: Decision-/Output-Schema inkl. `default_action` und `safe_default`.

## Blocker

- Keine harten; braucht das Schema aus Ticket 01.

## Umsetzungshinweise

- Die Card ist eine reine Darstellungs-Schicht ohne Side Effects: sie liest die
  Decision und rendert, sie entscheidet nichts.
- Die `[yes]`-/Vollnamen-Logik ist die sichtbare Spiegelung der
  `yes`-Falle-Abwehr aus Abschnitt 6 — Card-Sprache und Schema duerfen nie
  auseinanderlaufen (z.B. nie `[yes] uebernehmen` auf einer unsicheren
  Topic-Fit-Card).
- Card zeigt immer den aktuellen Step, die wichtigste Aussage und nur die
  erlaubten naechsten Aktionen.

## Akzeptanzkriterien

- Card rendert Gesucht/Gefunden/Entscheidung/Du-kannst aus den Provider-Daten.
- Eine sichere Default-Aktion erscheint als `[yes]`.
- Riskante Aktionen erscheinen nur mit vollem Namen, nie als `[yes]`.
- Bei `default_action: null` gibt es kein `[yes]`.
- Gerenderte Card wird als `cards/<phase>.md` ausgegeben.

## Tests / Verifikation

- Card mit sicherer Default-Aktion zeigt `[yes]`.
- Card mit nur `continue_anyway` (`safe_default: false`) zeigt kein `[yes]`,
  sondern `[continue anyway]` (vgl. Spec-Test 7).
- Card-Sprache enthaelt keine Backend-Begriffe (Candidate Selector, Source IDs,
  Scores).

## Uebergabe an Folge-Tickets

- Ticket 07 interpretiert die getippten Eingaben gegen die `proposed_actions`
  der gerade gerenderten Card.
- Ticket 05 persistiert die Card unter `cards/<phase>.md`.
