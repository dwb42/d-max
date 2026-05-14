# DMAX Context Response Contracts Acceptance

## 1. Executive Summary

Gesamtbewertung: Phase 2 funktioniert im echten App-Chat-Runtime-Pfad. Die zehn geprüften OpenClaw-Turns erzeugten frische Prompt Logs mit passender `Response policy`, kontextspezifischer `Response Guidance`, strukturiertem `context_payload_json` und überwiegend passenden deutschen Antworten.

Die Response Contracts verbessern die Antwortqualität sichtbar: Antworten starten meistens mit der konkreten Einschätzung, nutzen vorhandene Entitäten aus dem Kontext und bleiben stärker auf die jeweilige Ebene ausgerichtet. Besonders gut funktionieren `task`, `habit`, `project`, `ideas` und `categories`.

Neue Probleme: Einige Antworten sind noch etwas lang und überschriftenlastig. Die `idea`-Detail-Antwort ist fachlich passend, aber für die Frage sehr ausführlich. Bei `category` fehlen in der Antwort die erwarteten Labels Scope/Zustand/Schmerz/Zielbild explizit, obwohl der Inhalt abgedeckt wird. Die Eine-Frage-Regel wird überwiegend eingehalten; `category` und `project` schließen mit genau einer Frage, andere Modi stellen keine Rückfrage.

Wichtigste Empfehlung: Keine sofortige Codeänderung nötig. Für Phase 2.2 lohnt ein kleiner Prompt-Feinschliff: "bei explorativen Detailfragen max. 5-7 Abschnitte" und "keine Abschlussfrage, wenn bereits ein klarer nächster Schritt reicht".

## 2. Test Setup

- Datum: 2026-05-14
- Branch / Commit: `main` / `132deed`
- Datenbasis: lokale `data/dmax.dev.sqlite` mit vorhandenen DMAX-Daten.
- Neue Testdaten: keine neuen Domain-Entities angelegt. Die Abnahme erzeugte aber 10 neue App-Chat-Konversationen, User-/Assistant-Messages und Prompt Logs.
- Verwendeter Runtime-Pfad: `AppChatService.handleMessage()` -> `resolveConversationContext()` -> `buildContextualAgentMessage()` -> OpenClaw -> `app_prompt_logs`.
- Prompt Logs: `139` bis `148`.
- Prompt Inspector/API-Prüfung: `GET /api/debug/prompts` lieferte für Logs `139`-`148` jeweils `contextPayload` mit `loadedEntities` und `blocks`.

| Log | Mode | Entity | Final Prompt chars | Reply chars | Loaded | Omitted | Blocks | Dedup |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 139 | `categories` | - | 13751 | 2657 | 63 | 24 | 24 | 36 |
| 140 | `category` | 8, Koerper und Geist | 5805 | 2433 | 5 | 0 | 6 | 0 |
| 141 | `initiatives` | - | 14700 | 3949 | 81 | 6 | 11 | 35 |
| 142 | `ideas` | - | 4657 | 2741 | 9 | 0 | 5 | 0 |
| 143 | `projects` | - | 12732 | 2811 | 63 | 10 | 8 | 0 |
| 144 | `habits` | - | 6148 | 2598 | 26 | 2 | 14 | 0 |
| 145 | `idea` | 9, Hof bzw. Gut in Norddeutschland kaufen | 11599 | 5582 | 4 | 0 | 5 | 0 |
| 146 | `project` | 4, D-Max bauen | 5282 | 4518 | 6 | 0 | 4 | 0 |
| 147 | `habit` | 15, regelmaessig Sport machen | 4597 | 2378 | 5 | 0 | 5 | 0 |
| 148 | `task` | 1, Reiserad-Anbieter recherchieren | 9266 | 1879 | 15 | 2 | 4 | 0 |

Alle zehn finalen Prompts enthielten:

- `Response policy:`
- `Response Guidance:`
- `maximal eine gute Frage auf einmal`

## 3. Results by Context Mode

### 3.1 Category Overview

- Prompt Log: `139`
- Nutzerfrage: `Welche Lebensbereiche wirken aktuell unterversorgt oder nicht gut beschrieben?`
- Erwartete Antwortlogik: Gesamtbild der Lebensbereiche, unterversorgte/unscharfe Bereiche, Luecken zwischen Lebensbereich und Initiativen, keine Taskplanung.
- Finaler Prompt: gut. Enthielt Category-Overview-Guidance, Response Policy, Kategorie-/Initiativen-/Task-Kontext, Deduplication und Payload mit 63 geladenen Entities.
- `context_payload_json`: gut. Enthielt viele `loadedEntities`, 24 `omittedEntities`, 24 Blocks und 36 Deduplications; geeignet, um Budget und Task-Deduplication zu inspizieren.
- Agentenantwort: sehr passend. Startete mit Gesamtbild: "nicht primaer Initiativen knapp, sondern Lebensbereich-Beschreibungen". Benannte Familie, Koerper und Geist, Herz und Seele, Business, Vermoegensverwaltung, Freunde, Party & Pleasure, Haus und Hof. Kein Sprung in Taskplanung.
- Probleme: Antwort nutzt viele Abschnitte, bleibt aber noch angemessen. Keine konkrete Halluzination erkennbar.
- Empfehlung: keine Aenderung.

### 3.2 Category Detail

- Prompt Log: `140`
- Context: `category` #8, Koerper und Geist
- Nutzerfrage: `Hilf mir, diesen Lebensbereich besser zu beschreiben und pruefe, ob meine Initiativen dazu passen.`
- Erwartete Antwortlogik: Scope, Zustand, Schmerz, Zielbild/gewuenschte Qualitaet, Initiativen-Passung, eine naechste Frage.
- Finaler Prompt: gut. Enthielt Category-Detail-Facilitation, Response Guidance und Kategorie-/Initiativen-Kontext.
- `context_payload_json`: gut, aber klein: 5 geladene Entities, keine Omissions. Fuer diesen Kontext ausreichend.
- Agentenantwort: inhaltlich passend. Klaerte Scope und Nicht-Scope, pruefte Sport, Journal, Klavier, Yoga und schloss mit genau einer guten Frage.
- Probleme: "Aktueller Zustand" und "Schmerz/Spannung" wurden eher als Luecken benannt, nicht systematisch ausgearbeitet. Die Ueberschriften waren weniger nah an der erwarteten Struktur.
- Empfehlung: optionaler Feinschliff: Category Detail soll bei genau dieser Frage die Labels Zustand, Schmerz/Spannung und Zielbild expliziter verwenden.

### 3.3 Initiativen-Overview

- Prompt Log: `141`
- Nutzerfrage: `Passen meine aktuellen Ideen, Projekte und Gewohnheiten zu dem, was ich in meinen Lebensbereichen beschrieben habe?`
- Erwartete Antwortlogik: Initiativen gegen Lebensbereiche abgleichen, Diskrepanzen, unterversorgte Bereiche, vorsichtige Uebergewichtungen, neue Initiativen/Fokus.
- Finaler Prompt: gut, aber lang. Enthielt deduplizierten Kategorie-Hintergrund, gruppierte Initiativen, Tasks, Relations, Response Guidance.
- `context_payload_json`: gut. 81 loaded, 6 omitted, 35 deduplications; Debug-Sicht ist aussagekraeftig.
- Agentenantwort: passend und vorsichtig. Startete mit "teilweise", begruendete Begrenzung durch fehlende Zielbilder, verglich Reisen, Koerper & Geist, Familie, Business, Vermoegensverwaltung, Herz & Seele.
- Probleme: Antwort ist mit 3949 Zeichen etwas breit, aber fuer Overview-Frage vertretbar. Keine moralische Bewertung.
- Empfehlung: keine sofortige Aenderung; Laengenrisiko beobachten.

### 3.4 Ideenliste

- Prompt Log: `142`
- Nutzerfrage: `Welche Muster siehst du zwischen diesen Ideen und welche davon koennten reif fuer ein Projekt oder eine Gewohnheit sein?`
- Erwartete Antwortlogik: Cluster, Motive, Verbindungen, Reifegrade, angrenzende Ideen, erst oeffnen dann verdichten.
- Finaler Prompt: gut und kompakt. Enthielt Ideenlisten-Guidance, Cross-Type-Kontext und Kategorie-Hintergrund.
- `context_payload_json`: gut. 9 loaded, keine Omissions; fuer wenige Ideen ausreichend.
- Agentenantwort: sehr passend. Erkannte "Ort als Lebensqualitaet", "Koerper-Geist-Praxis", "Vom Besitz zum Rhythmus"; verdichtete danach Reifegrade.
- Probleme: Abschluss "Wenn du willst..." ist etwas generisch, aber nicht schadlich. Keine zu fruehe Taskliste.
- Empfehlung: keine Aenderung.

### 3.5 Projektliste

- Prompt Log: `143`
- Nutzerfrage: `Welche Projekte brauchen gerade am meisten Aufmerksamkeit und warum?`
- Erwartete Antwortlogik: Projekte mit Aufmerksamkeitsbedarf, Begruendung durch Scope/Blocker/Tasks/Fristen/Abhaengigkeiten, naechste Entscheidung.
- Finaler Prompt: gut, lang aber budgetiert. Enthielt Projektlisten-Guidance, Cross-Type-Kontext, offene Tasks, Zeitdaten.
- `context_payload_json`: gut. 63 loaded, 10 omitted, 8 Blocks; Omission-Tracking sichtbar.
- Agentenantwort: sehr passend. Priorisierte EOA Retreat, Reiserad, Radtour, Wohnung, Urlaub mit Kindern, Helsinki, D-Max; begruendete jeweils mit Frist, Lock-Status, offenen Tasks oder Abhaengigkeit.
- Probleme: keine DoD-Pruefung in der Liste ausser bei D-Max, aber die Nutzerfrage fokussierte Aufmerksamkeit, daher okay.
- Empfehlung: keine Aenderung.

### 3.6 Gewohnheitenliste

- Prompt Log: `144`
- Nutzerfrage: `Welche gewuenschten Qualitaeten werden noch nicht durch gute Gewohnheiten gepflegt?`
- Erwartete Antwortlogik: gepflegte/ungepflegte Qualitaeten, Lebensbereiche ohne Habits, fehlende Pflegehandlungen/Frequenzen, keine Projektlogik.
- Finaler Prompt: gut. Enthielt Habits-List-Guidance und explizit Life Areas without habits.
- `context_payload_json`: gut. 26 loaded, 2 omitted, 14 Blocks.
- Agentenantwort: passend. Nutzte Lebensbereiche ohne Gewohnheiten: Business, Vermoegensverwaltung, Freunde, Reisen, Party & Pleasure. Behandelte Habits als Pflegehandlungen und schlug Minimal-Gewohnheiten vor.
- Probleme: Einige Vorschlaege gehen schon in konkrete Habit-Ideen; bei dieser Frage ist das jedoch sinnvoll.
- Empfehlung: keine Aenderung.

### 3.7 Idea Detail

- Prompt Log: `145`
- Context: `idea` #9, Hof bzw. Gut in Norddeutschland kaufen
- Nutzerfrage: `Lass uns diese Idee frei explorieren. Welche Varianten, Hypothesen und Recherchefelder siehst du?`
- Erwartete Antwortlogik: Idee als Moeglichkeitsraum, Motivation/Hypothesen/Varianten, Recherchefelder, kleine Experimente erst spaeter, keine Taskliste.
- Finaler Prompt: gut. Enthielt Idea-Detail-Guidance, Kategorie-Hintergrund und Initiative-Markdown.
- `context_payload_json`: gut, aber nur 4 loaded entities; fuer die vorhandene Kategorie/Idee ausreichend.
- Agentenantwort: qualitativ stark. Behandelte die Idee als "Lebensform-Hypothese", entwickelte Varianten, Hypothesen, Recherchefelder, Vergleichsraeume und verdichtete am Ende auf drei Suchrichtungen.
- Probleme: Sehr lang (5582 Zeichen). Antwort enthielt keine kleinen Experimente, obwohl die Guidance sie vorsieht; die Nutzerfrage fragte aber Varianten/Hypothesen/Recherchefelder, daher ist das Weglassen okay. Starre Struktur nicht erkennbar, aber sehr umfangreich.
- Empfehlung: optionaler Feinschliff fuer Idea Detail: Bei Explorationsfragen eher 3-5 starke Varianten und 3-5 Recherchefelder, ausser Nutzer bittet um Breite.

### 3.8 Project Detail

- Prompt Log: `146`
- Context: `project` #4, D-Max bauen
- Nutzerfrage: `Hilf mir, Scope, Ziel und Taskstruktur dieses Projekts zu pruefen.`
- Erwartete Antwortlogik: Motivation/Ziel/Scope/Nicht-Scope/Definition of Done, Risiken/Blocker, Taskstruktur, naechster Schritt.
- Finaler Prompt: gut. Enthielt Project-Detail-Guidance und D-Max-Projektkontext.
- `context_payload_json`: gut. 6 loaded, keine Omissions; fuer das Projekt ausreichend.
- Agentenantwort: passend. Klaerte Scope, Ziel, Definition of Done, Scope/Nicht-Scope, Taskstruktur, schlug Arbeitsbloecke vor und stellte genau eine Klaerungsfrage.
- Probleme: Antwort ist lang und erzeugt relativ viele neue Taskideen, obwohl sie korrekt als Vorschlag und nicht als automatische Erstellung formuliert sind. Risiken/Blocker wurden nur indirekt behandelt.
- Empfehlung: kleiner Feinschliff denkbar: bei fehlender DoD zuerst DoD + 3 wichtigste Taskstruktur-Luecken, nicht direkt 4 Bloecke mit vielen Tasks.

### 3.9 Habit Detail

- Prompt Log: `147`
- Context: `habit` #15, regelmaessig Sport machen
- Nutzerfrage: `Hilf mir, die gewuenschte Qualitaet dieser Gewohnheit und passende Pflegehandlungen zu definieren.`
- Erwartete Antwortlogik: gewuenschte Qualitaet, Bedeutung, aktuelles Niveau/Zielniveau, Pflegehandlungen/Frequenzen, Minimalversion, keine Enddatum-Projektlogik.
- Finaler Prompt: gut. Enthielt Habit-Detail-Guidance und Kategorie-Hintergrund.
- `context_payload_json`: gut. 5 loaded, keine Omissions.
- Agentenantwort: sehr passend. Definierte Qualitaet, Pflegehandlungen, Minimal-/Standard-/Qualitaetsversion und Rhythmus. Keine Projektlogik oder Enddatum.
- Probleme: Aktueller Zustand und Zielniveau wurden nicht explizit als eigene Abschnitte behandelt; fuer die Nutzerfrage war das akzeptabel.
- Empfehlung: keine sofortige Aenderung.

### 3.10 Task Detail

- Prompt Log: `148`
- Context: `task` #1, Reiserad-Anbieter recherchieren
- Nutzerfrage: `Pruefe diese Aufgabe: Ist sie klar genug, richtig geschnitten und was waere der sinnvollste Loesungsweg?`
- Erwartete Antwortlogik: Task-Klarheit, Outcome, Splitting, Initiative/Sibling-Kontext, Reihenfolge/Dopplungen, operativ knapp.
- Finaler Prompt: gut. Enthielt Task-Detail-Guidance, aktuellen Task, uebergeordnete Initiative, sibling tasks und Kategorie-Hintergrund.
- `context_payload_json`: gut. 15 loaded, 2 omitted, 4 Blocks; ausreichend fuer Nachbarschaftspruefung.
- Agentenantwort: sehr passend und knapp. Pruefte Klarheit, Abgrenzung, sibling tasks #2-#4, Outcome und Loesungsweg. Bot bot an, selbst eine Shortlist zu erstellen.
- Probleme: keine.
- Empfehlung: keine Aenderung.

## 4. Cross-Mode Findings

### 4.1 Starre Template-Gefahr

Niedrig bis mittel. Der Agent nutzt haeufig passende Ueberschriften, aber nicht mechanisch exakt die Prompt-Contract-Listen. Er laesst irrelevante Abschnitte weg:

- `idea` laesst kleine Experimente weg, weil die Frage Varianten/Hypothesen/Recherchefelder priorisiert.
- `task` bleibt operativ statt Lebensanalyse auszugeben.
- `categories` springt nicht in Taskplanung.

Risiko: `project` und `idea` koennen bei Analysefragen sehr umfangreich werden.

### 4.2 Antwortlänge

Die Antwortlaenge passt meistens zur Frage. Auffaellig lang:

- `idea` Detail: 5582 Zeichen, fachlich gut, aber fuer Dialog eventuell zu breit.
- `project` Detail: 4518 Zeichen, hilfreich, aber fast schon ein Mini-Review.
- `initiatives` Overview: 3949 Zeichen, fuer Overview akzeptabel.

Kurze operative Frage im `task`-Modus bleibt mit 1879 Zeichen angenehm fokussiert.

### 4.3 Eine-Frage-Regel

Ueberwiegend eingehalten.

- `category`: genau eine naechste Frage.
- `project`: genau eine Klaerungsfrage.
- Andere Modi stellen keine Frage oder nur ein optionales Folgeangebot.

Kein Antwortfall enthielt einen grossen Fragenkatalog.

### 4.4 Sprache und Labels

Alle Agentenantworten waren auf Deutsch. Die englischen internen Prompt-Wrapper haben die Antwortsprache nicht sichtbar gestoert.

Einzelne englische Begriffe aus Daten/Produktkontext bleiben sichtbar (`Definition of Done`, `Scope`, `Task`), wirken aber fachlich passend.

### 4.5 Kontextnutzung

Gut. Der Agent verwendet konkrete vorhandene Entitaeten:

- Kategorien: Familie, Koerper und Geist, Business, Vermoegensverwaltung, Freunde, Party & Pleasure, Haus und Hof.
- Projekte: EOA Retreat, Reiserad, Radtour, Wohnung fuer Bianka, Urlaub mit Kindern, D-Max.
- Habits: Sport, Klavier, Journal, Yoga-Idee, Kinder betreuen.
- Task Detail: sibling tasks Anbieter -> Modelle -> Haendler -> Probefahrten.

Der Kontext wird aktiv genutzt, aber in den Antworten nicht roh wiederholt.

### 4.6 Halluzinations- oder Kontextdrift-Risiken

Keine harten Halluzinationen in den geprueften Antworten erkennbar. Einige Vorschlaege sind interpretativ, werden aber als moegliche Qualitaeten, Minimal-Gewohnheiten oder Vorschlaege formuliert.

Kontextdrift-Risiko besteht vor allem bei:

- `idea`: kreative Varianten koennen schnell sehr breit werden.
- `habits`: vorgeschlagene Minimal-Gewohnheiten koennen wie konkrete neue Objekte wirken, obwohl sie nur als Vorschlaege gemeint sind.
- `project`: viele vorgeschlagene Tasks koennen wie ein Planungsauftrag wirken; der Agent erstellt sie aber nicht automatisch.

## 5. Recommendations

| Priority | Finding | Suggested Fix | Likely Files |
|---|---|---|---|
| P1 | Idea Detail wird bei Explorationsfragen sehr lang. | Response Guidance ergaenzen: erst 3-5 staerkste Varianten/Hypothesen, weitere Breite nur auf Nachfrage. | `src/chat/conversation-context.ts`, `tests/chat/conversation-context.test.ts` |
| P2 | Project Detail erzeugt schnell viele Taskvorschlaege. | Guidance schaerfen: bei fehlender DoD zuerst DoD und 3 wichtigste Taskstruktur-Luecken; umfangreiche Tasklisten erst nach Bestaetigung. | `src/chat/conversation-context.ts` |
| P2 | Category Detail deckt Zustand/Schmerz/Zielbild inhaltlich ab, aber nicht immer explizit. | Optional Labels fuer Category-Detail-Fragen etwas verbindlicher machen, ohne Template-Zwang. | `src/chat/conversation-context.ts` |
| P3 | Overview-Modi haben hohe Promptlaengen. | In Phase 2.2 weiter beobachten; keine akute Aenderung, Budgeting greift. | `src/chat/conversation-context.ts` |
| P3 | Prompt Inspector wurde per API/Payload geprueft, nicht per Browser-Screenshot. | Bei naechster UI-Abnahme eine kurze Playwright-/Screenshot-Pruefung fuer Prompt Inspector ergaenzen. | `web/src/App.tsx`, `tests/web/` |

## 6. Should We Patch Now?

Keine Aenderung noetig.

Die Response Contracts funktionieren im echten Runtime-Verhalten. Kleine Prompt-Feinschliffe sind sinnvoll, aber nicht blockierend:

- `idea` knapper halten,
- `project` weniger schnell in umfangreiche Taskstruktur gehen,
- `category` Labels fuer Lebensbereichsklaerung etwas sichtbarer machen.

Groesseres Folgeprojekt ist nicht noetig.

## 7. Open Questions

- Wie kurz soll DMAX bei Detail-Explorationen standardmaessig sein? Die aktuelle Antwortqualitaet ist hoch, aber teils lang.
- Soll die Abschlussfrage immer optional bleiben, oder sollen manche Modi bewusst mit einem klaren Vorschlag statt Frage enden?
- Braucht der Prompt Inspector einen eigenen "Response Contract matched?"-Debug-Hinweis, oder reicht die finale Antwortbewertung?
- Sollen reale Acceptance-Turns kuenftig in einer separaten Testdatenbank laufen, damit die Dev-DB nicht mit Abnahme-Konversationen waechst?
