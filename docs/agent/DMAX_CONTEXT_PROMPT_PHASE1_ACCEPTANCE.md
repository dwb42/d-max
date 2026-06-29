# DMAX Context Prompt Phase 1 Acceptance

Date: 2026-05-14

## 1. Executive Summary

Gesamtbewertung: Phase 1 ist im Runtime-Pfad wirksam. Die zehn Kernmodi erhalten erkennbar unterschiedliche Instructions, der finale Prompt enthält die erwarteten Context-Blöcke, und neue Prompt Logs speichern eine strukturierte `context_payload_json`-Sicht. Die zentrale Pipeline läuft weiterhin über `AppChatService.prepareMessageTurn()` -> `resolveConversationContext()` -> `buildContextualAgentMessage()` -> `AppPromptLogRepository.create()`.

Was gut funktioniert:

- Alle zehn Kernmodi haben eigene Runtime-Instructions im finalen Prompt.
- `categories` und `initiatives` sind in Perspektive und Datenformat getrennt.
- Detailkontexte für Idea, Project, Habit und Task enthalten Kategorie-Markdown als Hintergrund.
- Detailkontexte enthalten Same-Category-Nachbarschaft; Task Detail enthält sibling tasks und Initiative-Hierarchie.
- Listenansichten `ideas`, `projects`, `habits` enthalten Cross-Type-Kontext pro Lebensbereich.
- `context_payload_json` wird im Prompt Log gespeichert und im Prompt Inspector angezeigt.

Problematisch oder offen:

- Kategorie- und Initiativen-Overview können durch doppelte globale/per-Category Task- und Background-Blöcke anwachsen.
- Category Detail lädt bis zu 7000 Zeichen Kategorie-Markdown plus 3000 Zeichen pro Initiative ohne harte Gesamtgrenze pro Kategorie.
- `context_payload_json` ist hilfreich, aber noch eher diagnostische Zusammenfassung als echte strukturierte Entity-Liste mit IDs und Truncation-Entscheidungen je Block.
- Sprache ist gemischt: globale Wrapper sind englisch, Modus-Instructions teilweise deutsch. Das ist funktional, aber nicht ideal konsistent.

Wichtigste nächste Empfehlung: Vor Phase 2 ein zentrales Context-Budget einführen, das pro Modus Gesamtzeichen, Entity-Caps und ausgelassene Entity-IDs strukturiert dokumentiert.

## 2. Test Setup

- Branch: `main`
- Commit: `132deed`
- Datum: 2026-05-14
- Working tree: uncommitted Phase-1-Änderungen plus bereits vorhandene unrelated Änderungen im Frontend/UI-Bereich.
- Testmethode: Runtime-Simulation über `AppChatService.handleMessage()` mit Fake-Agent-Runner, damit echte Prompt Logs entstehen, aber kein OpenClaw-Call und keine produktive SQLite-Datenbankmutation erfolgen.
- Datenbank: isolierte Test-DB über `tests/helpers/test-db.ts` und echte Migrationen.
- Relevanter Runtime-Pfad:
  - `src/chat/app-chat.ts`
  - `src/chat/conversation-context.ts`
  - `src/repositories/app-prompt-logs.ts`
  - `web/src/App.tsx` für Prompt-Inspector-Anzeige

Angelegte realistische Testdaten in der isolierten Test-DB:

- Kategorien:
  - `Health Acceptance` mit Scope, aktueller Situation, Bewertung, Schmerz, Zielbild/gewünschter Qualität, Spannungen.
  - `Business Acceptance` mit Scope, Zielbild, Schmerz, gewünschter Qualität.
  - `Unclear Acceptance` ohne Beschreibung.
  - System-Inbox aus Migration/Seed.
- Initiativen:
  - Ideen: `Context Modes Essay`, `Prompt Pattern Library`, `Morning Light Experiment`.
  - Projekte: `DMAX Product System`, `Phase 1 Context Architecture`, `Prompt Inspector Payload`, `Bedroom Reset`.
  - Gewohnheit: `Evening Shutdown`.
- Relations:
  - `Context Modes Essay` -> `Phase 1 Context Architecture`.
  - `Phase 1 Context Architecture` -> `Prompt Inspector Payload`.
  - `Morning Light Experiment` -> `Evening Shutdown`.
- Tasks:
  - Idea task: `Collect analogies for essay`.
  - Project tasks: `Review project scope and DoD`, `Compare prompt templates with runtime instructions`.
  - Habit task: `Define minimal shutdown version`.
  - Health project task: `List bedroom blockers`.
  - Checklist items on current project task and sibling task.

Verwendete Nutzerfragen:

| Mode | Frage |
|---|---|
| Category Overview | Welche Lebensbereiche wirken aktuell unterversorgt oder nicht gut beschrieben? |
| Category Detail | Hilf mir, diesen Lebensbereich besser zu beschreiben und pruefe, ob meine Initiativen dazu passen. |
| Initiatives Overview | Passen meine aktuellen Ideen, Projekte und Gewohnheiten zu dem, was ich in meinen Lebensbereichen beschrieben habe? |
| Ideas List | Welche Muster siehst du zwischen diesen Ideen und welche davon koennten reif fuer ein Projekt oder eine Gewohnheit sein? |
| Projects List | Welche Projekte brauchen gerade am meisten Aufmerksamkeit und warum? |
| Habits List | Welche gewuenschten Qualitaeten werden noch nicht durch gute Gewohnheiten gepflegt? |
| Idea Detail | Lass uns diese Idee frei explorieren. Welche Varianten, Hypothesen und Recherchefelder siehst du? |
| Project Detail | Hilf mir, Scope, Ziel und Taskstruktur dieses Projekts zu pruefen. |
| Habit Detail | Hilf mir, die gewuenschte Qualitaet dieser Gewohnheit und passende Pflegehandlungen zu definieren. |
| Task Detail | Pruefe diese Aufgabe: Ist sie klar genug, richtig geschnitten und was waere der sinnvollste Loesungsweg? |

Prompt-Längen aus der Runtime-Simulation:

| Mode | Final Prompt chars | System Instructions chars | Context Data chars |
|---|---:|---:|---:|
| Category Overview | 6250 | 2366 | 3788 |
| Category Detail | 5438 | 3339 | 1983 |
| Initiatives Overview | 7060 | 2315 | 4612 |
| Ideas List | 4463 | 2200 | 2125 |
| Projects List | 4664 | 2185 | 2393 |
| Habits List | 3398 | 2241 | 1056 |
| Idea Detail | 4070 | 2332 | 1623 |
| Project Detail | 4523 | 2350 | 2089 |
| Habit Detail | 3734 | 2316 | 1302 |
| Task Detail | 4826 | 2350 | 2354 |

## 3. Results by Context Mode

### 3.1 Category Overview

- Verwendete Frage: Welche Lebensbereiche wirken aktuell unterversorgt oder nicht gut beschrieben?
- Erwartete Rolle: Lebensbereichsorientierter Überblick, Leitfrage: Sind meine Lebensbereiche gut beschrieben und durch passende Initiativen unterlegt?
- Erkannte Runtime-Instructions:
  - `Type: categories`
  - `Category-Overview-Modus`
  - `Leitformel: Category Overview = thematischer globaler Lebensmodell-Agent.`
  - `Leitfrage: Sind meine Lebensbereiche gut beschrieben und durch passende Initiativen unterlegt?`
- Geladene Kontextdaten:
  - alle Kategorien inkl. Inbox.
  - Kategorie-Markdown-Auszüge als `Category markdown excerpt`.
  - `Description status`.
  - Initiative-Mix je Kategorie: ideas/projects/habits.
  - Initiativen je Kategorie kompakt nach Typ.
  - offene Tasks je Kategorie.
  - Kategorien ohne Beschreibung.
  - Kategorien ohne Initiativen.
  - Precedence Relations.
  - Planning Canvas Summary.
  - globale Open Execution Surface.
- `context_payload_json`-Bewertung:
  - `current`: `4 categories`.
  - `children`: Initiativen und offene Tasks gruppiert nach Kategorie.
  - `neighbors`: Relation-Count.
  - `limits`: Caps für Kategorie-Markdown, Initiativen pro Typ und Tasks.
  - Sinnvoll, aber nicht granular genug, um zu sehen, welche konkreten Kategorien/Initiativen ausgelassen wurden.
- Qualitative Bewertung:
  - Perspektive ist klar lebensbereichsorientiert.
  - Der Prompt ermöglicht Lückenanalyse nach Beschreibung, Initiative-Unterlegung und Tasks.
  - Modus ist klar von `initiatives` unterscheidbar.
- Gaps / Empfehlungen:
  - Per-Category offene Tasks und globale Open Execution Surface können dieselben Tasks doppelt zeigen.
  - Bei vielen Kategorien droht Prompt-Wachstum, weil jede Kategorie Markdown-Auszug, Initiativen und Tasks bekommt.
  - `context_payload_json.current` könnte Kategorie-IDs oder counts nach beschrieben/unbeschrieben enthalten.

### 3.2 Category Detail

- Verwendete Frage: Hilf mir, diesen Lebensbereich besser zu beschreiben und prüfe, ob meine Initiativen dazu passen.
- Erwartete Rolle: Lebensbereichs-Coach + Alignment-Prüfer.
- Erkannte Runtime-Instructions:
  - `Typ: category`
  - `Category-Detail-Facilitation-Modus`
  - `Kategorie-Agent = Lebensbereichs-Coach + Alignment-Pruefer`
  - Strukturziele: Scope, aktuelle Situation, Bewertung, Zielzustand, Spannungen, Ideen, Gewohnheiten, Projekte, Verbindung Ist-Zustand/Zielbild.
- Geladene Kontextdaten:
  - aktuelle Kategorie mit Markdown-Beschreibung bis 7000 Zeichen.
  - Ideen, Projekte, Gewohnheiten der Kategorie mit Markdown bis 3000 Zeichen je Initiative.
  - offene Tasks der Kategorie.
  - Relations, die Kategorie-Initiativen berühren.
- `context_payload_json`-Bewertung:
  - `current`: konkrete Kategorie.
  - `children`: counts für Ideas, Projects, Habits, offene Tasks.
  - `neighbors`: count für precedence relations.
  - `limits`: Kategorie- und Initiative-Markdown-Caps.
  - Für Debugging brauchbar, aber nicht ausreichend, um konkrete geladene Initiative-IDs aus dem JSON zu rekonstruieren.
- Qualitative Bewertung:
  - Der stärkste Prompt im System bleibt stark.
  - Coach- und Alignment-Perspektive sind klar.
  - Die Kategorie-Beschreibung und Initiative-Markdowns sind inhaltlich ausreichend.
- Gaps / Empfehlungen:
  - Parent-/Child-Initiativen fehlen im Category Detail noch.
  - Participants, Media und Calendar fehlen im Category Detail.
  - Kein Gesamtbudget über alle Initiative-Markdowns; bei großen Kategorien riskant.

### 3.3 Initiatives Overview

- Verwendete Frage: Passen meine aktuellen Ideen, Projekte und Gewohnheiten zu dem, was ich in meinen Lebensbereichen beschrieben habe?
- Erwartete Rolle: Initiativenorientierter globaler Alignment-Agent.
- Erkannte Runtime-Instructions:
  - `Type: initiatives`
  - `Initiativen-Overview-Modus`
  - `Leitformel: Initiativen-Overview = globaler Alignment-Agent.`
  - `Leitfrage: Passen meine Initiativen zu meinen Lebensbereichen?`
- Geladene Kontextdaten:
  - alle Initiativen nach Typ gruppiert.
  - innerhalb jedes Typs gruppiert nach Lebensbereich.
  - Kategorie-Hintergrund in den gruppierten Abschnitten.
  - separate `Life area background`-Übersicht.
  - Precedence Relations.
  - Planning Canvas Summary.
  - offene Tasks über Initiativen.
- `context_payload_json`-Bewertung:
  - `current`: `8 initiatives`.
  - `parents`: `4 category backgrounds`.
  - `children`: offene Tasks.
  - `neighbors`: Relation-Count.
  - `limits`: Caps für Category background, typed initiatives, open tasks.
- Qualitative Bewertung:
  - Perspektive ist klar anders als Category Overview: Startpunkt sind Initiativen und ihre Passung zu Kategorien.
  - Diskrepanz zwischen Lebensbereichsbeschreibung und Initiative-Aufmerksamkeit ist im Prompt angelegt.
- Gaps / Empfehlungen:
  - Kategorie-Hintergrund wird pro Typ-Abschnitt wiederholt und zusätzlich separat als `Life area background`; das erzeugt frühe Duplikation.
  - Parent-/Child-Hierarchie wird in der Overview noch nicht sichtbar.
  - Planning Canvas wird nur als count sichtbar, nicht als Aufmerksamkeit/Platzierung pro Projekt.

### 3.4 Ideas List

- Verwendete Frage: Welche Muster siehst du zwischen diesen Ideen und welche davon könnten reif für ein Projekt oder eine Gewohnheit sein?
- Erwartete Rolle: Kreativer Portfolio-Sparringraum.
- Erkannte Runtime-Instructions:
  - `Type: ideas`
  - `Ideenlisten-Modus`
  - `Ideenliste = kreativer Portfolio-Sparringraum`
  - `Erst oeffnen, dann verdichten`
  - Muster, Cluster, Motive, Hypothesen, Reife für Projekt/Gewohnheit/Experiment/Recherche.
- Geladene Kontextdaten:
  - alle Ideen gruppiert nach Lebensbereich.
  - Kategorie-Hintergrund je Lebensbereich.
  - Cross-Type-Kontext zu Projekten und Gewohnheiten in derselben Kategorie.
  - Relations touching ideas.
  - offene Tasks an Ideen.
- `context_payload_json`-Bewertung:
  - `current`: `3 ideas`.
  - `parents`: category backgrounds.
  - `children`: offene Tasks an Ideen.
  - `siblings`: Hinweis, dass Cross-Type-Initiativen derselben Kategorien enthalten sind.
  - `neighbors`: relation count.
- Qualitative Bewertung:
  - Rolle ist passend; der Prompt vermeidet frühe Operationalisierung ausdrücklich.
  - Cross-Type-Kontext reicht aus, um Ideen als Projekt-/Gewohnheitskandidaten zu bewerten.
- Gaps / Empfehlungen:
  - Es werden keine vollständigen Idea-Markdowns geladen, nur Summary/erste Markdown-Zeile.
  - Keine semantischen Cluster oder Tagging-Daten vorhanden; Agent muss Muster rein aus Textnamen/Summaries ableiten.

### 3.5 Projects List

- Verwendete Frage: Welche Projekte brauchen gerade am meisten Aufmerksamkeit und warum?
- Erwartete Rolle: Projektportfolio- und Aufmerksamkeits-Agent.
- Erkannte Runtime-Instructions:
  - `Type: projects`
  - `Projektlisten-Modus`
  - `Projektliste = Projektportfolio- und Aufmerksamkeits-Agent`
  - Scope, Definition of Done, Taskstruktur, Blocker, Abhängigkeiten, Reihenfolge, Zeiträume, Projektphase und Lock-Status.
- Geladene Kontextdaten:
  - alle Projekte gruppiert nach Lebensbereich.
  - Projektphase, Zeitraum und Lock-Status über `formatCompactInitiative`.
  - Kategorie-Hintergrund je Lebensbereich.
  - Cross-Type-Kontext zu Ideen und Gewohnheiten derselben Kategorie.
  - Relations touching projects.
  - offene Tasks an Projekten.
- `context_payload_json`-Bewertung:
  - `current`: `4 projects`.
  - `parents`: category backgrounds.
  - `children`: offene Tasks an Projekten.
  - `siblings`: Cross-Type-Hinweis.
  - `neighbors`: relation count.
- Qualitative Bewertung:
  - Gute Phase-1-Abdeckung für Portfolio-Fragen.
  - Der Prompt liefert genug Daten, um Attention Needs aus Tasks, Zeitdaten, Lock-Status und Kategorie-Zielbild abzuleiten.
- Gaps / Empfehlungen:
  - Projekt-Markdown wird in der Liste nicht vollständig geladen, daher Definition of Done/Scope nur sichtbar, wenn Summary/erste Markdown-Zeile reicht.
  - Parent-/Child-Projekte sind in Listen nur über Parent-Suffix an der Initiative sichtbar, nicht als eigener strukturierter Abschnitt.
  - Calendar-/Workblock-Daten fehlen weiterhin.

### 3.6 Habits List

- Verwendete Frage: Welche gewünschten Qualitäten werden noch nicht durch gute Gewohnheiten gepflegt?
- Erwartete Rolle: Qualitäts- und Pflege-Portfolio-Agent.
- Erkannte Runtime-Instructions:
  - `Type: habits`
  - `Gewohnheitenlisten-Modus`
  - `Gewohnheitenliste = Qualitaets- und Pflege-Portfolio-Agent`
  - gewünschte Qualitäten, Pflegehandlungen, Frequenzen, unrealistische Zuschnitte, Lebensbereiche ohne passende Gewohnheit.
- Geladene Kontextdaten:
  - alle Gewohnheiten gruppiert nach Lebensbereich.
  - Kategorie-Hintergrund mit Zielbild/gewünschter Qualität, soweit im Markdown vorhanden.
  - Cross-Type-Kontext zu Ideen und Projekten derselben Kategorie.
  - Relations touching habits.
  - offene Tasks an Gewohnheiten.
- `context_payload_json`-Bewertung:
  - `current`: `1 habits`.
  - `parents`: category backgrounds.
  - `children`: offene Tasks an Gewohnheiten.
  - `siblings`: Cross-Type-Hinweis.
  - `neighbors`: relation count.
- Qualitative Bewertung:
  - Klare Abgrenzung Habit = Qualitätspflege, nicht Ergebnisarbeit.
  - Kategorie-Zielbild ist ausreichend sichtbar, um fehlende Pflegehandlungen zu erkennen.
- Gaps / Empfehlungen:
  - Kein echtes Frequenzmodell; die Instruction benennt das korrekt.
  - Ohne Habit-Markdown in Listen kann der Agent Pflegehandlungen nur aus Summary/erster Markdown-Zeile und Tasks ableiten.
  - Lebensbereiche ohne Habit werden nicht explizit als eigene Liste im Habits-Context genannt; der Agent kann sie nur indirekt über Kategorien mit Cross-Type-Daten erkennen, falls Kategorie ohne Habit nicht wegen leerer habit list ausgelassen wird. In der aktuellen Listenlogik werden Kategorien ohne Habits gar nicht ausgegeben.

### 3.7 Idea Detail

- Verwendete Frage: Lass uns diese Idee frei explorieren. Welche Varianten, Hypothesen und Recherchefelder siehst du?
- Erwartete Rolle: Möglichkeitsraum öffnen.
- Erkannte Runtime-Instructions:
  - `Type: idea`
  - `Ideen-Detail-Modus`
  - `Ideen-Agent = kreativer Sparringspartner fuer Moeglichkeitsraeume`
  - Idee ist noch kein Projekt und keine Aufgabe.
  - Motivation, Hypothesen, Varianten, Analogien, Vergleichsbeispiele, angrenzende Möglichkeiten.
  - Nicht zu früh operationalisieren.
- Geladene Kontextdaten:
  - aktuelle Idee mit Header und Initiative Markdown.
  - Kategorie mit Kategorie-Markdown als `Category background`.
  - Parent initiative und Child initiatives.
  - Predecessors und Successors.
  - Same-Category-Nachbarschaft nach Typ.
  - Media attachments, Participants.
  - Tasks der Idee.
- `context_payload_json`-Bewertung:
  - `current`: konkrete Initiative inkl. Typ.
  - `parents`: Kategorie und Parent-Initiative-Status.
  - `children`: child initiatives, tasks, media, participants.
  - `siblings`: andere Initiativen derselben Kategorie.
  - `neighbors`: predecessor/successor counts.
- Qualitative Bewertung:
  - Zielbild wird sehr gut getroffen.
  - Der Agent hat genug Kontext, um Verwandtschaft zu Projekten/Gewohnheiten und Reifegrad zu erkennen.
- Gaps / Empfehlungen:
  - Same-Category-Nachbarschaft lädt kompakt, aber ohne Markdown-Details; für echte Duplikatserkennung evtl. zu dünn.
  - `context_payload_json` sagt nur count, nicht welche Nachbarn geladen wurden.

### 3.8 Project Detail

- Verwendete Frage: Hilf mir, Scope, Ziel und Taskstruktur dieses Projekts zu prüfen.
- Erwartete Rolle: Scope-Klärer + Umsetzungsarchitekt.
- Erkannte Runtime-Instructions:
  - `Type: project`
  - `Projekt-Detail-Modus`
  - `Projekt-Agent = Scope-Klaerer + Umsetzungsarchitekt`
  - Motivation, Lebensbereich, Ziel, gewünschtes Ergebnis, Definition of Done, Scope/Nicht-Scope, Zeitraum, Meilensteine, Abhängigkeiten, Risiken, Blocker, offene Fragen.
  - Danach Taskprüfung: Zuschnitt, Zielbezug, Lücken, Dopplungen, Reihenfolge, Entscheidungstasks.
- Geladene Kontextdaten:
  - aktuelles Projekt mit Projektphase, Zeitraum, Lock-Status, Summary.
  - Kategorie-Markdown als `Category background`.
  - Projekt-Markdown.
  - Parent initiative.
  - Child initiatives.
  - Predecessors und Successors.
  - Same-Category-Nachbarschaft.
  - Media, Participants.
  - Projekt-Tasks.
- `context_payload_json`-Bewertung:
  - `current`: konkrete Projektinitiative.
  - `parents`: Kategorie und Parent-Projekt.
  - `children`: Child-Initiativen und Tasks.
  - `siblings`: andere Initiativen derselben Kategorie.
  - `neighbors`: predecessor/successor counts.
- Qualitative Bewertung:
  - Sehr geeignet für Scope- und Taskstrukturprüfung.
  - Die Instruction führt sauber von Projektdefinition zu Taskstruktur.
- Gaps / Empfehlungen:
  - Meilensteine existieren nicht als eigenes Datenmodell und können nur aus Markdown/Tasks abgeleitet werden.
  - Calendar-/Workblock-Kontext fehlt.
  - Same-Category-Nachbarn sind kompakt, nicht mit Markdown.

### 3.9 Habit Detail

- Verwendete Frage: Hilf mir, die gewünschte Qualität dieser Gewohnheit und passende Pflegehandlungen zu definieren.
- Erwartete Rolle: Qualitätscoach + Pflegehandlungs-Strukturierer.
- Erkannte Runtime-Instructions:
  - `Type: habit`
  - `Gewohnheiten-Detail-Modus`
  - `Gewohnheiten-Agent = Qualitaetscoach + Pflegehandlungs-Strukturierer`
  - Gewohnheit führt kein einmaliges Ergebnis herbei, sondern pflegt langfristig Qualität.
  - gewünschte Qualität, Motivation, aktuelles Niveau, Zielniveau, Pflegehandlungen, Minimalversionen, Hindernisse, wiederkehrende Tasks/Erinnerungen.
  - Frequenzen als Text-/Task-Logik, kein neues Frequency-Modell.
- Geladene Kontextdaten:
  - aktuelle Gewohnheit mit Header und Habit Markdown.
  - Kategorie-Markdown als `Category background`.
  - Parent/Child-Initiativen.
  - Predecessors/Successors.
  - Same-Category-Nachbarschaft.
  - Media, Participants.
  - Tasks der Gewohnheit.
- `context_payload_json`-Bewertung:
  - `current`: konkrete Habit-Initiative.
  - `parents`: Kategorie und Parent-Status.
  - `children`: child initiatives, tasks, media, participants.
  - `siblings`: andere Initiativen derselben Kategorie.
  - `neighbors`: predecessor/successor counts.
- Qualitative Bewertung:
  - Klarer Perspektivwechsel gegenüber Project Detail.
  - Kategorie-Zielbild und Habit Markdown reichen aus, um Pflegehandlungen und Minimalversionen zu klären.
- Gaps / Empfehlungen:
  - Frequenzen bleiben rein textuell; korrekt für Phase 1, aber limitiert.
  - Keine recurring task/calendar Daten.

### 3.10 Task Detail

- Verwendete Frage: Prüfe diese Aufgabe: Ist sie klar genug, richtig geschnitten und was wäre der sinnvollste Lösungsweg?
- Erwartete Rolle: operativer Umsetzer + Taskstruktur-Prüfer.
- Erkannte Runtime-Instructions:
  - `Type: task`
  - `Task-Detail-Modus`
  - `Task-Agent = operativer Umsetzer + Taskstruktur-Pruefer`
  - Klarheit, eindeutiges Outcome, Split, Passung zur Initiative und zum Lebensbereich.
  - sibling tasks, Parent-/Child-Initiativen, Same-Category-Nachbarschaft, Relations.
  - Überschneidungen, Dopplungen, Konflikte, Reihenfolgen, Tool-Unterstützung.
- Geladene Kontextdaten:
  - aktueller Task mit Status, Priorität, Due Date, Completion-Status.
  - Checklist.
  - Notes.
  - Media, Participants.
  - übergeordnete Initiative mit Header.
  - Kategorie und Kategorie-Markdown.
  - Initiative Markdown Excerpt.
  - Parent initiative.
  - Child initiatives der übergeordneten Initiative.
  - Initiative predecessors/successors.
  - andere Initiativen derselben Kategorie.
  - sibling tasks derselben Initiative inkl. kompakter Checklist-Auszüge.
- `context_payload_json`-Bewertung:
  - `current`: konkrete Task.
  - `parents`: übergeordnete Initiative, Kategorie, Parent-Initiative.
  - `children`: Checklist, Media, Participants.
  - `siblings`: sibling tasks, child initiatives, other same-category initiatives.
  - `neighbors`: initiative predecessor/successor counts.
  - `limits`: Caps für Kategorie, Initiative Markdown, siblings, sibling checklist, same-category initiatives.
- Qualitative Bewertung:
  - Sehr guter operativer Kontext für Taskqualität, Reihenfolge und Ausführbarkeit.
  - Sibling-Checklist-Auszüge sind nützlich für Dopplungs- und Reihenfolgeprüfung.
- Gaps / Empfehlungen:
  - Child-Section-Label `Child initiatives of parent initiative` ist semantisch leicht missverständlich; technisch sind es Child-Initiativen der übergeordneten Initiative des Tasks, nicht Kinder der Parent-Initiative.
  - Kein Calendar Entry / Workblock-Kontext.
  - `context_payload_json` sollte konkrete sibling task IDs enthalten.

## 4. Prompt Quality Findings

- Zu lang:
  - Category Detail kann bei vielen Initiativen stark wachsen: Kategorie 7000 Zeichen plus jede Initiative 3000 Zeichen.
  - Initiatives Overview wiederholt Kategorie-Hintergrund je Initiative-Typ und danach nochmals als Life area background.
  - Category Overview enthält offene Tasks je Kategorie und zusätzlich globale Open Execution Surface.
- Zu kurz:
  - Listenansichten nutzen für Initiativen nur kompakte Summary/erste Markdown-Zeile. Für echte Scope-/DoD-/Pflegehandlungsanalyse kann das zu dünn sein.
  - Habits List zeigt Kategorien ohne Habit nicht explizit, obwohl genau diese Lücke wichtig ist.
- Zu generisch:
  - `tasks` List View bleibt im Vergleich zu Task Detail noch generisch; sie war nicht Kernfokus dieser Phase, aber könnte später eine eigene operative Portfolio-Instruktion bekommen.
- Falsche Perspektive:
  - Keine harte falsche Perspektive gefunden. Die zehn Kernmodi unterscheiden sich ausreichend.
- Sprachqualität:
  - Gemischte deutsche Modus-Instructions mit englischem Wrapper (`Current DMAX conversation context`, `Context data`) sind funktional, aber unelegant.
  - Category Detail ist vollständig deutscher und wirkt dadurch konsistenter.
- Zu viel Kontext:
  - Overview-Modi tendieren zu Wiederholung und könnten bei realer Datenmenge schnell die höchste Prompt-Länge erzeugen.

## 5. Context Payload Findings

`context_payload_json` funktioniert: neue Prompt Logs enthalten ein JSON mit `version`, `context`, `title`, `dataSources`, `current`, `parents`, `children`, `siblings`, `neighbors`, `related`, `limits`, `notes`.

Sinnvoll gefüllt:

- `current` benennt den aktiven Fokus.
- `parents` zeigt Kategorie-/Parent-Initiative-Hintergrund in Detailkontexten.
- `children` zählt Tasks, Child-Initiativen, Media, Participants.
- `siblings` benennt Same-Category- oder sibling-task-Kontext.
- `neighbors` zählt Relations.
- `limits` macht Truncation- und Entity-Caps sichtbar.

Debug-Lücken:

- Die Payload enthält meist Counts und Text-Hinweise, aber keine strukturierten Entity-Arrays.
- Es ist nicht sichtbar, welche konkreten IDs geladen oder ausgelassen wurden.
- Es ist nicht sichtbar, ob ein bestimmter Markdown-Block tatsächlich trunciert wurde oder nur truncierbar war.
- `related` und `notes` bleiben leer; das ist okay, aber noch ungenutzt.
- Für Listenansichten wäre eine strukturierte Gruppierung nach Kategorie und Typ wertvoll.

## 6. Token / Prompt Length Risks

Besonders lange Modi in der Simulation:

- Initiatives Overview: 7060 Zeichen.
- Category Overview: 6250 Zeichen.
- Category Detail: 5438 Zeichen trotz kleiner Testdaten.
- Task Detail: 4826 Zeichen.

Risikobewertung:

- Bei realen großen Kategorien ist Category Detail der größte Risikokandidat, weil die Anzahl der Initiative-Markdowns nicht durch ein Gesamtbudget begrenzt ist.
- Initiatives Overview kann stark wachsen, weil Kategorie-Hintergründe mehrfach wiederholt werden.
- Category Overview kann wachsen, weil pro Kategorie Initiativen und Tasks plus globale Taskliste enthalten sind.
- Detailkontexte sind durch Caps besser kontrolliert, können aber bei vielen Same-Category-Initiativen und Tasks ebenfalls wachsen.

Empfohlene Caps:

- Gesamtbudget pro Context-Modus, z. B. 12k-18k Zeichen für normale Chat-Turns.
- Kategorie-Detail: Max-Initiativen pro Typ mit Priorisierung plus Markdown-Budget je Typ.
- Initiatives Overview: Kategorie-Hintergrund nur einmal, dann typed initiatives referenzieren.
- Listenansichten: Kategorien ohne typgleiche Initiativen optional kompakt anzeigen, wenn sie für Lückenanalyse wichtig sind.

## 7. UX / Prompt Inspector Findings

- Der final prompt bleibt im Prompt Inspector sichtbar.
- `Context Payload JSON` wird im Prompt Inspector als pretty JSON angezeigt.
- Das ist für Entwickler ausreichend, aber bei längeren Payloads nicht komfortabel.
- Keine funktionale UI-Regression im Prompt Inspector aus der Abnahme ersichtlich.
- Potenzielle UX-Verbesserung: Payload als kollabierbare Sektionen (`current`, `parents`, `children`, `siblings`, `neighbors`, `limits`) statt reiner JSON-Text.

## 8. Recommended Fixes Before Phase 2

| Priority | Issue | Suggested Fix | Files likely involved |
|---|---|---|---|
| P1 | Kein Gesamt-Token-/Zeichenbudget pro Modus | Zentrales Budget-/Truncation-Modul einführen, das geladene und ausgelassene Blöcke dokumentiert | `src/chat/conversation-context.ts` |
| P1 | `context_payload_json` enthält Counts, aber keine konkreten IDs | Payload um strukturierte `loadedEntities` / `omittedEntities` mit IDs, Typen und Truncation-Status ergänzen | `src/chat/conversation-context.ts`, `src/repositories/app-prompt-logs.ts` |
| P1 | Initiatives Overview wiederholt Kategorie-Hintergrund | Kategorie-Hintergrund einmal gruppiert ausgeben, typed initiative sections referenzieren Kategorie nur kurz | `src/chat/conversation-context.ts` |
| P2 | Category Detail kann durch Initiative-Markdowns explodieren | Pro Typ priorisieren und Gesamtbudget für Initiative-Markdowns anwenden | `src/chat/conversation-context.ts` |
| P2 | Habits List zeigt Lebensbereiche ohne Habits nicht explizit | Zusätzlichen Abschnitt `Life areas without habits` mit Kategorie-Zielbild-Auszug ergänzen | `src/chat/conversation-context.ts`, Tests |
| P2 | Listenansichten haben nur kompakte Initiative-Memory | Für ausgewählte high-signal Initiativen kurze Markdown-Excerpts laden | `src/chat/conversation-context.ts` |
| P2 | Gemischte Sprache im Prompt Wrapper | Für Browser-DMAX-Kontexte einheitlich deutsche Context-Wrapper verwenden oder bewusst dokumentieren | `src/chat/conversation-context.ts`, Prompt-Template-Tests |
| P3 | Prompt Inspector zeigt Payload nur als Text | Kollabierbare Debug-Ansicht für Payload-Sektionen bauen | `web/src/App.tsx`, `web/src/styles.css` |
| P3 | Keine Calendar-/Workblock-Daten in Project/Task-Kontexten | Phase-2-Resolver für relevante Calendar Entries/Project Span Bindings definieren | `src/chat/conversation-context.ts`, Calendar repositories |

## 9. Open Questions

- Soll der DMAX-App-Context vollständig deutsch werden, oder ist der englische Wrapper für OpenClaw bewusst beibehalten?
- Soll `context_payload_json` langfristig Entwicklerdiagnostik bleiben oder auch für UI-/User-Transparenz gedacht sein?
- Welche echte Prompt-Gesamtgröße ist für die verwendeten OpenClaw-/Modellpfade akzeptabel?
- Sollen Listenansichten Kategorien ohne typgleiche Initiativen anzeigen, wenn diese Lücken für die jeweilige Analyse zentral sind?
- Wie sollen Parent-/Child-Initiativen in Category Overview und Initiatives Overview priorisiert werden?
- Wann sollen Calendar Entries, Workblocks und Google Bindings in Project/Task-Kontexte aufgenommen werden?
- Soll es Snapshot-Tests für vollständige Prompt-Strukturen geben, oder bleiben robuste Containment-Tests ausreichend?
