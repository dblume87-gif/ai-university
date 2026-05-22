# Entscheidungen

Dieses Dokument haelt kurze Architektur- und Produktentscheidungen fest. Es ist kein ausfuehrliches ADR-Archiv, sondern ein leichtgewichtiger Decision Log fuer die fruehe Entwicklung.

## 2026-05-12: OCW-Ingestion vor Video-Generierung

**Entscheidung:** Vor der NotebookLM-Video-, YouTube- und Website-Pipeline braucht AI University eine vorgelagerte OCW-Ingestion: Kurse finden, Kursmetadaten erfassen und Lernmaterialien strukturiert in die lokale Library bringen.

**Warum:** Ohne belastbare Kurs- und Materialerfassung muessten NotebookLM-Notebooks, Videos und YouTube-Uploads manuell gepflegt werden. Das Tageslimit der NotebookLM-Videoerzeugung macht eine saubere Queue und Statusbasis zusaetzlich wichtig.

**Konsequenz:** Video-Generierung, YouTube-Publishing und On-Demand-Nutzerinhalte bleiben Produktziele, aber die aktive Software beginnt bei Discovery, Screening, Materialerfassung und NotebookLM-Vorbereitung.

## 2026-05-13: Lokaler Workspace bleibt die Arbeitsgrenze

**Entscheidung:** Projektanalyse und Implementierung fuer AI University sollen nur innerhalb des Workspace `ai-university` erfolgen, sofern nicht explizit anders beauftragt.

**Warum:** Das Git-Repo und OpenClaw-Kontext liegen teilweise oberhalb des Projektordners. Eine enge Arbeitsgrenze verhindert, dass unrelated Parent-Dateien oder andere Projekte versehentlich in Analyse, Doku oder Commits einfliessen.

**Konsequenz:** Projektentscheidungen und Doku beziehen sich auf Dateien unter `ai-university/`. Uebergeordnete Agent-/OpenClaw-Kontexte werden nur als Laufzeitkontext behandelt, nicht als Projektartefakte.

## 2026-05-13: Dean/JSON-Manifest-CLI wird nicht der erste Build

**Entscheidung:** Die fruehe Idee eines lokalen Python-CLI namens `Dean` mit JSON-Manifesten als primaerer Statusschicht wird vorerst nicht umgesetzt.

**Warum:** Der Ansatz war als Manifest- und QA-Layer fuer eine bestehende lokale Kursbibliothek sinnvoll, haette aber Discovery, Screening und spaetere Queries ueber viele OCW-Kurse nur indirekt geloest.

**Konsequenz:** JSON-/Markdown-Manifeste koennen weiterhin Outputs oder Review-Artefakte sein. Der aktive Build konzentriert sich auf die Node.js `ocw-pipeline` und `library.db`.

## 2026-05-15: Strukturierte OCW-Daten zuerst, HTML und externe Seiten als Fallback

**Entscheidung:** Screening nutzt zuerst strukturierte OCW-Quellen wie `data.json` und `content_map.json`. HTML-Scraping der Kursseiten und externe Course Websites sind Fallbacks beziehungsweise Spezialadapter.

**Warum:** Strukturierte OCW-Daten sind reproduzierbarer und weniger fragil als reine HTML-Parser. Gleichzeitig haben echte Kurse Sonderstrukturen, externe Websites oder lueckenhafte JSON-Daten.

**Konsequenz:** Die Pipeline ist mehrstufig: Discovery findet Kurs-URLs, Screening liest strukturierte Daten, ergaenzt Kursseiten-Metadaten und klassifiziert Sonderfaelle, statt eine einzige grosse Scraping-Logik zu erzwingen.

## 2026-05-16: SQLite ist lokaler Source of Truth

**Entscheidung:** `ocw-pipeline/library.db` ist der zentrale lokale Statusspeicher fuer Kurse, Materialien, Screening-Ergebnisse und NotebookLM-Zuordnung.

**Warum:** Die Pipeline braucht Queries nach Status, Tier, Materiallage und Freigaben. SQLite bleibt lokal, schnell und ohne Server betreibbar, ist aber robuster als eine grosse JSON-Datei.

**Konsequenz:** Generierte Manifeste und Markdown-Dateien sind Outputs. Pipeline-Status wird nicht aus ihnen rekonstruiert.

## 2026-05-16: Shallow Screening und Deep Materialisierung werden getrennt

**Entscheidung:** Fuer groessere OCW-Batches darf Screening in zwei Stufen laufen: schnelles Vorscreening ohne Resource-Detail-Requests und tiefere Materialisierung nur fuer starke Kandidaten.

**Warum:** Alle OCW-Kurse vollstaendig zu screenen erzeugt viele Requests. Fuer die Auswahl von Tier-1/2-Kandidaten reicht zuerst eine schnelle Bewertung aus Kursdaten und Content Map; konkrete Materiallinks sind vor allem fuer gute Kandidaten relevant.

**Konsequenz:** Die CLI unterstuetzt `--fast` und `--deep-tier`. Grosse Laeufe koennen erst breit indexieren und danach gezielt Materiallinks fuer Tier 1/2 nachziehen.

## 2026-05-16: Kurszentrierte Ingestion vor Lernpfaden

**Entscheidung:** Der aktive Build bewertet zuerst einzelne Kurse. Lernpfade werden spaeter als Kuratierungs-Layer darueber gelegt.

**Warum:** Materiallage, Extrahierbarkeit und NotebookLM-Tauglichkeit muessen pro Kurs stabil sein, bevor Lernpfade sinnvoll automatisiert werden koennen.

**Konsequenz:** Screening, Shortlist und NotebookLM-Ready Gate funktionieren ohne Lernpfad-Manifest.

## 2026-05-16: Discovery ist nicht gleich Auswahl

**Entscheidung:** Discovery speichert gefundene Kurse als Kandidaten, trifft aber keine Produkt- oder Lernpfad-Auswahl.

**Warum:** Suchqueries wie `biology` koennen thematisch breite oder indirekte Treffer liefern. Ob ein Kurs fuer AI University wertvoll ist, ergibt sich erst aus Metadaten, Materiallage, Struktur und spaeterer Kuratierung.

**Konsequenz:** Discovery schreibt `discovered` Kurse und `discovery_log`. Auswahl passiert danach ueber Screening, Shortlist, Similarity und manuelle beziehungsweise spaetere kuratorische Regeln.

## 2026-05-16: Konkrete Materiallinks werden beim Screening erfasst

**Entscheidung:** Screening speichert konkrete Materialien in `materials`: PDFs, YouTube-/Video-Links, HTML-Ressourcen, externe Links, Code-/Archive-/Datenquellen und lokale Library-Quellen.

**Warum:** `learning_resource_types` pro Kurs reichen nicht aus, um NotebookLM-Manifeste, Upload-Queues oder Materialqualitaet belastbar zu bewerten. Die Pipeline braucht echte Quellen mit URL, Titel, Herkunft und Typ.

**Konsequenz:** `materials` trennt fachliche `material_type` wie `Lecture Notes` von technischem `media_type` wie `pdf` oder `youtube`. Re-Screening ersetzt Materialien idempotent pro Kurs, damit keine Duplikate entstehen.

## 2026-05-16: Kursseiten-Metadaten werden separat persistiert

**Entscheidung:** Neben OCW `data.json` werden sichtbare Kursseiten-Metadaten wie Departments, Department Numbers, As Taught In, Level und Topics gespeichert.

**Warum:** `data.json` liefert nicht alle kuratorisch wichtigen Sidebar-Informationen in der Form, in der sie auf der Kursseite sichtbar sind. Fuer Relevanz, Filter und spaetere Auswahl braucht die Library diese Felder strukturiert.

**Konsequenz:** `courses` enthaelt strukturierte Department-/Level-/Topic-Felder und ein kompaktes `course_page_metadata` JSON.

## 2026-05-16: Explizites NotebookLM Approval Gate

**Entscheidung:** Ein technisch geeigneter Kurs wird nicht automatisch hochgeladen. Vor dem Upload gibt es `notebooklm ready`, optional `notebooklm approve` und einen bewussten `export` oder `upload`.

**Warum:** NotebookLM-Quellen, Tageslimits, Duplikate und manuelle Qualitaetssicherung sind aktuell reale Engpaesse.

**Konsequenz:** `ready_for_notebooklm`, `approved_for_notebooklm` und `uploaded_to_notebooklm` bleiben getrennte Statuswerte.

## 2026-05-16: NotebookLM Sync gleicht Online-Notebooks ab, importiert aber nicht blind

**Entscheidung:** Online vorhandene NotebookLM-Notebooks werden gegen `library.db` synchronisiert, aber nicht automatisch als neue lokale Kurse oder finale Wahrheit uebernommen.

**Warum:** Es gibt bestehende und teilweise doppelte Online-Notebooks. Automatisches Uebernehmen wuerde Duplikate, alte Experimente und unklare Kurszuordnungen in die lokale Library ziehen.

**Konsequenz:** `notebooklm sync` schreibt eindeutige Notebook-IDs, Source Counts und Status in passende lokale Kurse. Nicht eindeutig zuordenbare Online-Notebooks bleiben Review-Aufgaben.

## 2026-05-16: Modul-READMEs werden vorerst vermieden

**Entscheidung:** Es gibt keine README pro `src/*`-Modul. Architektur und Datenfluss werden zentral in `docs/ARCHITECTURE.md` dokumentiert.

**Warum:** Das Projekt ist noch klein genug, dass viele Modul-READMEs Pflegeaufwand erzeugen wuerden.

**Konsequenz:** `ocw-pipeline/README.md` ist das Entwicklerhandbuch, `docs/ARCHITECTURE.md` erklaert die Module.

## 2026-05-22: NotebookLM Chat ist ausreichend fuer V0

**Entscheidung:** Der Learning Path V0 darf NotebookLM als source-grounded Chat-Backend nutzen.

**Warum:** Der Integration-Spike gegen MIT 6.0001 hat gezeigt, dass `notebooklm ask --json` strukturierte References mit konkreten `source_id`s liefert. Inline-Citations sind ueber `citation_number` mapbar, und wiederholtes `-s <source-id>` verhielt sich im Test als strikter Source-Filter. `learning-guide` reicht fuer einen ersten Tutor-Modus.

**Konsequenz:** Der naechste Build muss keinen eigenen Retrieval-Chat erfinden. Er soll zuerst eine kleine Adapter-/Walking-Skeleton-Schicht bauen: Source IDs auswaehlen, `ask --json` ausfuehren, Antwort und Citations speichern, dann optional Materialgeneration aus denselben Sources starten.

## 2026-05-22: Learning Path V0 vor V1-Zielarchitektur

**Entscheidung:** Der naechste Schritt ist ein V0-Walking-Skeleton, nicht die komplette Learning-Path-Zielarchitektur.

**Warum:** Der Zielplan enthaelt viele Bausteine: Contract Normalizer, Candidate Selector, Screening Gate, Planner, Notebook Manager, Mindmap Indexer, Source Resolver, Chat Orchestrator und Production Router. Ohne einen kleinen End-to-End-Lernloop wuerde zu viel Architektur vor dem ersten echten Nutzerwert entstehen.

**Konsequenz:** V0 beschraenkt sich auf ein bestehendes Notebook, feste oder einfach gemappte Source IDs, quellenbasierten Chat und eine optionale Materialproduktion. V1 darf danach Contract, Kursauswahl, Material-Screening, eigenes Path-Notebook und Mindmap-Routing ausbauen.

## 2026-05-22: Mindmap ist Navigation, nicht Source of Truth

**Entscheidung:** Mindmaps werden als Themenuebersicht und Navigationshilfe genutzt, aber nicht als primaere Quelle fuer Unit-/Source-Mapping.

**Warum:** `download mind-map` liefert eine reine Text-Hierarchie aus `name` und `children`, ohne Source IDs, Citation IDs oder stabile Node IDs.

**Konsequenz:** Mindmap-Knoten muessen heuristisch oder spaeter ueber Embeddings/LLM-Klassifikation auf Units und Sources gemappt werden. Fuer V0 ist Mindmap-Routing optional; V1 muss diesen Mapping-Schritt explizit modellieren und testen.

## 2026-05-22: Learning-Path-Workflows brauchen Resume-State

**Entscheidung:** Bevor lange Lernpfad-Workflows produktiv werden, braucht es einen eigenen Learning-Path-State mit Resume-Punkten.

**Warum:** Contract -> Kursauswahl -> Material-Screening -> Lernplan -> Notebook -> Upload -> Mindmap -> Chat/Materialien kann Minuten bis Stunden dauern und enthaelt externe NotebookLM-Side-Effects.

**Konsequenz:** V0 kann mit einem kleinen lokalen State starten. V1 sollte eigene Tabellen oder JSON-State-Dateien fuer Contracts, Paths, Units, Sources, Chat-Turns und Artefakte einfuehren.
