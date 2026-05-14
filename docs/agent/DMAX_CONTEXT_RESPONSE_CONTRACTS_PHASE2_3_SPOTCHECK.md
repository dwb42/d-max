# DMAX Context Response Contracts Phase 2.3 Spotcheck

## 1. Executive Summary

Gesamtbewertung: Die Phase-2.2-Feinschliffe sind im echten Runtime-Pfad sichtbar im finalen Prompt. Die Wirkung ist aber unterschiedlich stark.

- `project` Detail wirkt deutlich verbessert: kuerzer als in der Phase-2-Acceptance, zuerst Ziel/Scope/DoD, nur drei Taskstruktur-Luecken, keine lange Taskliste, keine Abschlussfrage.
- `category` Detail nutzt sichtbar explizitere Labels und ist kuerzer. `Scope`, `Aktueller Zustand`, `Zielbild / gewuenschte Qualitaet`, `Passung` und `Luecken` erscheinen. `Schmerz / Spannung` fehlt noch als eigenes Label.
- `idea` Detail enthaelt die neuen Guidance-Hinweise im Prompt, bleibt in der Antwort aber praktisch genauso lang wie vorher. Es liefert 5 Varianten, 5 Hypothesen und 5 Recherchefelder, aber immer noch eine breite Analyse statt einer deutlich knapperen Exploration.

Wichtigste Beobachtung: Die Phase-2.2-Guidance reicht fuer `project` und teilweise `category`, aber nicht fuer `idea` Detail. Wenn kuerzere Idea-Exploration wirklich wichtig ist, braucht `idea` eine staerkere Laengen-/Priorisierungsregel.

## 2. Test Setup

- Datum: 2026-05-14
- Branch / Commit: `main` / `132deed`
- Runtime: lokaler API-/OpenClaw-Pfad ueber `POST /api/chat/message`
- OpenClaw Status vor Test: `ready`
- Datenbasis: lokale `data/dmax.dev.sqlite`, vorhandene reale DMAX-Daten.
- Neue Domain-Testdaten: keine.
- Erzeugte Prompt Logs:

| Log | Mode | Entity | Final Prompt chars | Reply chars | Loaded Entities | Blocks |
|---|---|---:|---:|---:|---:|---:|
| 149 | `idea` | 9, Hof bzw. Gut in Norddeutschland kaufen | 12335 | 5602 | 4 | 5 |
| 150 | `project` | 4, D-Max bauen | 5941 | 3174 | 6 | 4 |
| 151 | `category` | 8, Koerper und Geist | 6480 | 2277 | 5 | 6 |

Alle drei finalen Prompts enthielten:

- `Response Guidance:`
- neue Phase-2.2-Hinweise fuer den jeweiligen Modus,
- globale Policy `Stelle nicht automatisch am Ende jeder Antwort eine Frage`,
- `context_payload_json`.

Verwendete Nutzerfragen:

- Idea Detail: `Lass uns diese Idee frei explorieren. Welche Varianten, Hypothesen und Recherchefelder siehst du?`
- Project Detail: `Hilf mir, Scope, Ziel und Taskstruktur dieses Projekts zu pruefen.`
- Category Detail: `Hilf mir, diesen Lebensbereich besser zu beschreiben und pruefe, ob meine Initiativen dazu passen.`

## 3. Results

### 3.1 Idea Detail

- Prompt Log: `149`
- Finale Prompt-Pruefung: gut. Der finale Prompt enthaelt die neuen Hinweise:
  - 3-5 staerkste Varianten/Hypothesen/Richtungen,
  - 3-5 Recherche-/Inputfelder,
  - Breite nur auf ausdrueckliche Nachfrage,
  - nicht automatisch mit Frage schliessen.
- Antwortbewertung: fachlich stark, aber der Feinschliff wirkt nicht ausreichend. Die Antwort behandelt die Idee weiter als Lebensform-Hypothese und bleibt explorativ, aber sie ist mit 5602 Zeichen sogar minimal laenger als die Phase-2-Antwort mit 5582 Zeichen.
- Laenge / Kuerze: nicht verbessert. Die Antwort enthaelt:
  - 4 Motivkerne,
  - 5 Varianten,
  - 5 Hypothesen,
  - 5 Recherchefelder,
  - eine abschliessende Unterscheidung A/B.
- Positiv: keine zu fruehe Taskliste, keine automatische Objektanlage, keine unnoetige Abschlussfrage.
- Probleme: Der Agent folgt der Zahl 3-5, waehlt aber jeweils die obere Breite und kombiniert mehrere volle 3-5-Listen. Dadurch bleibt die Antwort breit und lang.
- Empfehlung: kleiner weiterer Feinschliff sinnvoll. Idea Detail sollte fuer normale Explorationsstarts eher "maximal 2 der drei Gruppen: Varianten, Hypothesen, Recherchefelder" oder "insgesamt 5-7 Punkte ueber alle Gruppen" vorgeben.

### 3.2 Project Detail

- Prompt Log: `150`
- Finale Prompt-Pruefung: sehr gut. Der finale Prompt enthaelt die neuen Hinweise:
  - bei unklarem Ziel/Scope/DoD zuerst Projektdefinition klaeren,
  - hoechstens 3 wichtigste Taskstruktur-Luecken,
  - keine umfangreiche Taskliste bei unklarer Projektdefinition,
  - keine automatische Abschlussfrage.
- Antwortbewertung: deutlich verbessert. Die Antwort beginnt mit der Beobachtung, dass der Projektkern erkennbar, aber noch zu weich fuer eine saubere Taskstruktur ist. Danach klaert sie Ziel, Scope, Nicht-Scope und Definition of Done.
- Laenge / Kuerze: 3174 Zeichen statt 4518 Zeichen in der Phase-2-Acceptance. Die Antwort bleibt substanziell, aber deutlich fokussierter.
- Taskstruktur: passend. Es werden genau drei Luecken genannt:
  - Projektdefinition festziehen,
  - Nutzungsfluss validieren,
  - Architektur-/Integrationsluecken sammeln.
- Positiv: keine umfangreiche Taskliste; der naechste Schritt wird als Vorschlag formuliert: erst Projektbeschreibung mit Ziel, Scope, Nicht-Scope und DoD, dann 5-8 Tasks ableiten.
- Probleme: keine blockierenden.
- Empfehlung: keine Aenderung noetig.

### 3.3 Category Detail

- Prompt Log: `151`
- Finale Prompt-Pruefung: gut. Der finale Prompt enthaelt die neuen Hinweise zu expliziten Labels und die globale Abschlussfragen-Policy.
- Antwortbewertung: verbessert. Die Antwort beginnt mit einer kurzen Gesamteinschaetzung und verwendet dann explizite Labels:
  - `Scope`,
  - `Aktueller Zustand`,
  - `Zielbild / gewuenschte Qualitaet`,
  - `Passung deiner Initiativen`,
  - `Auffaellige Luecken`,
  - `Naechster guter Klaerungsschritt`.
- Laenge / Kuerze: 2277 Zeichen statt 2433 Zeichen in der Phase-2-Acceptance. Kuerzer und besser strukturiert.
- Flexibilitaet: gut. Die Antwort wirkt nicht mechanisch; sie fasst erst den Kern des Lebensbereichs zusammen und nutzt Labels dann als klare Struktur.
- Probleme: Das Label `Schmerz / Spannung` fehlt weiterhin als eigenes Label. Die Antwort benennt implizit Spannung, dass Initiativen eher Praxis/Routine abdecken als Zielbild, aber nicht mit dem geforderten Label.
- Abschlussfrage: eine Frage am Ende. Sie ist inhaltlich plausibel fuer Lebensbereichsklaerung, aber die neue Policy wollte Abschlussfragen vorsichtiger machen. Hier ist die Frage vertretbar, weil sie der naechste Klaerungsschritt ist.
- Empfehlung: optionaler kleiner Feinschliff, falls Label-Treue wichtig ist: Category Detail soll bei Lebensbereichsklaerung immer ein kurzes `Schmerz / Spannung`-Label aufnehmen, auch wenn es nur "noch unklar" sagt.

## 4. Cross Findings

### Antwortlaenge

- `project` verbessert deutlich: 4518 -> 3174 Zeichen.
- `category` verbessert leicht: 2433 -> 2277 Zeichen.
- `idea` nicht verbessert: 5582 -> 5602 Zeichen.

### Abschlussfragen

- `idea`: keine Abschlussfrage.
- `project`: keine Abschlussfrage; klarer naechster Schritt als Vorschlag.
- `category`: eine Abschlussfrage; in diesem Kontext plausibel und nicht als unnoetiger Fragenabschluss zu werten.

### Label-Nutzung

- `category` nutzt die meisten gewuenschten Labels explizit.
- Fehlend bleibt nur `Schmerz / Spannung` als eigener Abschnitt.

### Flexibilitaet vs. Template-Gefahr

- Keine Antwort wirkt streng template-artig.
- `category` ist strukturierter, aber noch natuerlich.
- `project` ist fokussierter, ohne seine Rolle als Scope-Klaerer zu verlieren.
- `idea` bleibt kreativ und natuerlich, aber zu breit.

## 5. Recommendation

Kleiner weiterer Feinschliff sinnvoll, aber nicht blockierend.

Empfohlen:

1. `idea` Detail schaerfen: Bei normalen Explorationsstarts insgesamt 5-7 priorisierte Punkte statt 3-5 pro Untergruppe. Danach "weitere Varianten kann ich im naechsten Schritt oeffnen".
2. Optional `category` Detail schaerfen: Bei Lebensbereichsklaerung ein explizites `Schmerz / Spannung`-Label ausgeben, auch wenn der Inhalt noch unsicher ist.
3. `project` Detail so lassen; der Phase-2.2-Feinschliff wirkt wie beabsichtigt.

Bereit fuer die naechste fachliche Phase, sofern die lange `idea`-Antwort akzeptabel ist. Wenn kuerzere Ideen-Exploration ein Produktziel ist, vorher einen sehr kleinen Phase-2.4-Prompt-Patch nur fuer `idea` Detail machen.
