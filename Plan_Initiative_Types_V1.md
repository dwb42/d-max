# Plan: Initiative Types V1

Stand: 2026-05-01

Dieses Dokument plant den ersten kleinen Umsetzungsschnitt fuer Initiative
Types in d-max.

Es baut auf `Plan_Project_Types.md` auf. Dort ist das fachliche Verstaendnis
festgehalten: Das heutige technische Objekt `Project` wird perspektivisch als
`Initiative` verstanden und bekommt einen `type` mit den Werten `idea`,
`project` oder `habit`.

V1 soll diese Unterscheidung nutzbar machen, ohne sofort Statusmodelle,
Recurrence, grosse UI-Umbauten oder ein technisches Refactoring von `Project`
zu `Initiative` mitzuziehen.

## Ziel von V1

V1 soll d-max in die Lage versetzen, bestehende und neue Eintraege fachlich als
Idee, Projekt oder Gewohnheit zu unterscheiden.

Die erste Version soll:

- `type` als strukturiertes Feld einfuehren
- bestehende Eintraege konservativ als `project` behandeln
- eine `Inbox` Category als Pflicht-Category-Fallback sicherstellen
- neue Ideen, Projekte und Habits mit passendem Type erstellen koennen
- den Type in API, Tools, Kontextdaten und UI sichtbar machen
- dem Agenten genug Kontext geben, um grob typbewusst zu reagieren

V1 soll nicht versuchen, alle fachlichen Konsequenzen sofort zu loesen.

## Leitentscheidung

Der Code darf in V1 weiterhin `Project` heissen.

`Initiative` ist die fachliche Ziel-Sprache und der konzeptionelle Oberbegriff,
aber V1 ist kein flächendeckendes Rename-Refactoring. Das reduziert Risiko,
vermeidet unnoetige Aenderungen und erlaubt, die fachliche Segmentierung zuerst
zu validieren.

Praktisch bedeutet das:

- Datenbanktabelle bleibt vorerst `projects`
- Repository bleibt vorerst `ProjectRepository`
- API-Routen bleiben vorerst `/api/projects`
- Chat-Kontext bleibt vorerst `project`
- das neue Feld `type` traegt die fachliche Unterscheidung

Ein spaeteres Refactoring von `Project` zu `Initiative` bleibt moeglich, ist
aber ein eigener Roadmap-Punkt.

## V1-Scope

### 1. Datenmodell

Das bestehende `projects`-Schema bekommt ein neues Pflichtfeld `type`.

V1-Werte:

| Wert | Bedeutung |
| --- | --- |
| `idea` | Idee |
| `project` | konkretes Projekt |
| `habit` | Gewohnheit |

Konservative V1-Regel:

- bestehende Projects werden bei Migration `project`
- neue Projects bekommen explizit einen Type
- wenn kein Type uebergeben wird, ist `project` der Default

Diese Default-Regel ist pragmatisch, weil der heutige Bestand am ehesten dem
bisherigen Projektverstaendnis entspricht und bestehende Aufrufe nicht sofort
brechen sollen.

### 2. Inbox Category

Category bleibt Pflichtfeld.

V1 soll eine Category `Inbox` sicherstellen. Sie dient als Fallback, wenn bei
einer neuen Idee, einem Projekt oder einer Habit die passende Category noch
unklar ist.

Wichtig:

- `category_id` wird nicht optional
- `Inbox` ist kein Sonderfall im Datenmodell
- `Inbox` ist eine normale beziehungsweise systemisch abgesicherte Category
- der Agent darf `Inbox` nutzen, wenn die Einordnung unklar ist

Offen fuer die Detailplanung:

- ob `Inbox` als `is_system = 1` markiert wird
- ob `Inbox` beim Setup automatisch angelegt wird
- ob bestehende Installationen eine Migration fuer `Inbox` bekommen

### 3. Repository, API und Tools

V1 soll `type` durch die bestehende technische Oberflaeche reichen.

Betroffene Flaechen:

- `Project` TypeScript-Typ
- `ProjectRepository`
- `createProject`
- `updateProject`
- `listProjects`
- API Responses fuer Projects und Overview
- Web-Typen
- Tool-Schemas fuer OpenClaw

V1 sollte erlauben:

- Projects nach `type` zu listen oder spaeter zu filtern
- beim Erstellen den Type zu setzen
- beim Aktualisieren den Type zu aendern, sofern spaeter gewuenscht

Ob Type-Aenderungen in V1 bereits frei erlaubt werden oder nur technisch
moeglich sind, wird im Datenmodell-/Tool-Slice entschieden.

### 4. Kontextresolver und Agent-Kontext

Der Agent muss den Type sehen.

V1 soll in `src/chat/conversation-context.ts` mindestens folgende Informationen
in den Kontext aufnehmen:

- Project/Initiative Type
- fachliche Bedeutung des Types
- Category
- Status
- Summary
- Markdown-Memory
- Tasks / Massnahmen

Minimaler Anspruch:

- bei `idea` soll der Agent eher klaeren, spiegeln und sortieren
- bei `project` soll der Agent eher planen, priorisieren und Umsetzung
  erzeugen
- bei `habit` soll der Agent eher pflegen, reflektieren und sanft
  accountability-orientiert denken

V1 braucht noch keine finalen Prompt Templates. Es reicht, die Kontextdaten und
kurze typbezogene Hinweise so zu erweitern, dass OpenClaw nicht blind gegen den
Type arbeitet.

### 5. UI V1

Die UI soll den Type sichtbar und einfach nutzbar machen, aber keine drei
vollstaendig verschiedenen Produktbereiche bauen.

V1 kann minimal enthalten:

- Type-Badge in Listen
- Type-Anzeige in Detail Views
- einfache Filterung oder Gruppierung nach Type
- beim Erstellen neuer Eintraege Auswahl: Idee, Projekt, Gewohnheit
- `Inbox` als sichtbare Category

Nicht V1:

- vollstaendig eigene Detail Views pro Type
- eigene Habit-Dashboards
- komplexe Reflexionsansichten
- Kalender- oder Recurrence-UI

### 6. Agentenverhalten V1

V1 soll den Agenten grob typbewusst machen.

Beispiele:

- "Dokumentiere eine Idee ..." erzeugt `type = idea`
- "Lege ein Projekt an ..." erzeugt `type = project`
- "Ich moechte eine Gewohnheit starten ..." erzeugt `type = habit`
- bei unklarer Category nutzt der Agent `Inbox` oder fragt nach, wenn die
  Einordnung wichtig ist

Der Agent soll weiterhin keine unklaren oder riskanten Massenaktionen ohne
Klaerung ausfuehren.

V1 ist noch nicht der Ort fuer:

- vollstaendige typabhaengige Agentenpersoenlichkeiten
- komplexe Coaching-Logik
- automatische Lifecycle-Uebergaenge
- proaktive Erinnerungen

## V1 Nicht-Ziele

V1 soll ausdruecklich nicht enthalten:

- technisches Rename-Refactoring von `Project` zu `Initiative`
- neue Tabellen fuer Ideas oder Habits
- optionale Categories
- finale typabhaengige Statusmodelle
- Recurrence
- Kalenderintegration
- Habit-Streaks
- Habit-Frequenzen
- vollstaendige Habit-Coaching-Logik
- automatische Umwandlungslogik `idea -> project` oder `idea -> habit`
- komplexe UI-Neustrukturierung
- neue Session- oder Memory-Tabellen

## Reihenfolge der Umsetzungsslices

V1 kann in kleineren Schritten geplant und umgesetzt werden.

### Slice 1: Datenmodell und Migration

Ergebnis:

- `projects.type` ist fachlich und technisch geplant
- erlaubte Werte sind festgelegt
- bestehende Projects bekommen `project`
- `Inbox`-Strategie ist geklaert
- Context-Resolver-Auswirkungen sind bekannt

### Slice 2: Repository, API und Tool-Schemas

Ergebnis:

- `type` fliesst durch Repository und API
- Tools koennen `type` setzen und anzeigen
- Tests decken Create/List/Get/Update ab

### Slice 3: Kontextresolver und Agent-Hinweise

Ergebnis:

- OpenClaw bekommt den Type im Kontext
- typbezogene Kurz-Hinweise sind im Agent-Kontext
- Schema-Sync-Test ist bewusst aktualisiert

### Slice 4: UI V1

Ergebnis:

- Type ist sichtbar
- Type kann beim Erstellen gesetzt werden
- einfache Filterung oder Gruppierung ist moeglich
- `Inbox` ist sichtbar und nutzbar

### Slice 5: Runtime-Memory und Verhalten

Ergebnis:

- `openclaw/workspace/AGENTS.md` kennt die drei Typen knapp
- `openclaw/workspace/TOOLS.md` beschreibt Type- und Inbox-Regeln knapp
- Agent erstellt Ideen, Projekte und Habits mit passendem Type

## Entscheidungen fuer V1

- `type` wird eingefuehrt.
- Die erlaubten Werte sind `idea`, `project`, `habit`.
- Der bestehende Code darf vorerst `Project` heissen.
- `Initiative` ist die fachliche Oberbegriff-Sprache.
- Bestehende Eintraege werden initial als `project` behandelt.
- Category bleibt Pflichtfeld.
- `Inbox` wird als Fallback-Category eingefuehrt oder abgesichert.
- Tasks heissen fachlich Massnahmen und technisch `Task`.
- Recurrence wird nicht in V1 geloest.
- Typabhaengige Statusmodelle werden nicht in V1 geloest.

## Offene Fragen fuer den naechsten Slice

Diese Fragen gehoeren direkt in den naechsten Planungsschritt:

- Soll `projects.type` im SQL-Schema `not null default 'project'` bekommen?
- Soll es einen SQL-Check fuer `idea`, `project`, `habit` geben?
- Soll `listProjects` schon in V1 einen `type`-Filter bekommen?
- Soll `updateProject` den Type aendern duerfen?
- Wie wird `Inbox` angelegt: Setup, Migration oder Repository-Sicherung?
- Soll `Inbox` `is_system = 1` sein?
- Welche Tests muessen angepasst werden, damit Type und Inbox nicht nur
  zufaellig funktionieren?

## Naechster Schritt

Als naechstes wird Slice 1 ausgearbeitet:

`Datenmodell und Migration fuer Initiative Types`

Dieser Slice soll noch nicht die gesamte Umsetzung bauen. Er soll konkret
entscheiden, wie `projects.type`, bestehende Daten und `Inbox` im Schema und in
Migrationen behandelt werden.
