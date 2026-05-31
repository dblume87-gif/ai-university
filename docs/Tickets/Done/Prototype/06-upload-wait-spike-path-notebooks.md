# 06 Upload/Wait-Spike fuer Path-Notebooks

Status: Ready
Build-Order-Punkt: 6
Parallelisierbar: ja, unabhaengig von 04 und 05

## Ziel

Empirisch klaeren, ob und wie neue NotebookLM-Path-Notebooks automatisiert
erstellt, mit Sources befuellt und ueber ein Ready-Gate abgesichert werden
koennen.

## Scope

- Spike-Sequenz ausfuehren:
  - `notebooklm create`
  - `notebooklm source add`
  - `notebooklm source wait --json`
  - `notebooklm source list --json`
- Typische PDFs, YouTube-Links und falls sinnvoll lokale Dateien testen.
- Upload- und Processing-Dauern dokumentieren.
- JSON-Statuswerte fuer `processing`, `ready`, `failed`, `unsupported` oder
  tatsaechliche Alternativen dokumentieren.
- Klaeren, ob `source wait --json` als `sources_ready` Gate reicht.
- Fehler bei grossen oder nicht unterstuetzten Quellen dokumentieren.

## Nicht im Scope

- V1-Path-Notebook-Implementierung.
- Automatischer Upload ganzer Lernpfade.
- Produktionsreife Retry- oder Resume-Logik.

## Abhaengigkeiten

- Installierte und authentifizierte NotebookLM-CLI.
- Mindestens ein kleiner, kontrollierter Test-Quellensatz.
- Schreibbarer Spike-Artefaktordner, z.B. `docs/spike-artifacts/`.

## Blocker

- NotebookLM Auth abgelaufen.
- Netzwerk oder CLI nicht verfuegbar.
- NotebookLM akzeptiert benoetigte Source-Typen nicht oder liefert keine
  maschinenlesbaren Statuswerte.

## Umsetzungshinweise

- Kommandos und JSON-Ausgaben als Artefakte speichern.
- Zeiten mit `/usr/bin/time -p` oder vergleichbarer Messung erfassen.
- Test-Notebook eindeutig als Spike-Notebook benennen.
- Keine produktiven Course- oder Learning-Path-Statuswerte veraendern.

## Akzeptanzkriterien

- Es gibt dokumentierte Rohartefakte fuer Create, Add, Wait und Source List.
- Ready-, Processing- und Fehlerstatuswerte sind bekannt oder als nicht
  verfuegbar dokumentiert.
- Eine klare Go/Caveat/Blocker-Empfehlung fuer Ticket 09 liegt vor.
- Das empfohlene `sources_ready` Gate ist konkret beschrieben.

## Tests / Verifikation

- Mindestens ein kleiner Source-Upload erreicht `ready` oder einen dokumentierten
  Ersatzstatus.
- Mindestens ein problematischer Source-Fall ist dokumentiert oder bewusst
  ausgelassen mit Begruendung.
- `source list --json` nach `source wait --json` zeigt den finalen Zustand.

## Uebergabe an Folge-Tickets

- Ticket 09 uebernimmt Statuswerte, Wait-Gate, Fehlerformen und Retry-Hinweise.
- Ticket 10 darf Path-Notebook-Orchestrierung erst planen, wenn diese Ergebnisse
  dokumentiert sind.

