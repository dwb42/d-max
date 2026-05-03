# Plan: Initiative Types Slice 1 - Datenmodell und Migration

Stand: 2026-05-01

Dieses Dokument plant den ersten konkreten Umsetzungsslice fuer Initiative
Types: Datenmodell, Migration und Inbox-Sicherung.

Es ist noch kein Code-Change. Es soll die Entscheidungen so weit klaeren, dass
der naechste Schritt klein und kontrolliert implementiert werden kann.

## Ausgangslage im aktuellen Repo

Der aktuelle technische Container heisst `Project`.

Relevante Tabellen:

- `categories`
- `projects`
- `tasks`

`projects` hat aktuell unter anderem:

- `category_id`
- `parent_id`
- `name`
- `status`
- `summary`
- `markdown`
- `sort_order`
- `is_system`

`projects.markdown` ist verpflichtende Project Memory.

Categories sind Pflicht. `projects.category_id` ist `not null`.

Es gibt bereits eine Inbox-Logik fuer Tasks ohne Projektkontext:

- `src/tools/tasks.ts` kann bei `useInboxIfProjectMissing` eine Category
  `Inbox` sicherstellen.
- Dabei wird auch ein systemisches Project `Inbox` erstellt.
- Dieses systemische Inbox-Project dient als Capture-Project fuer konkrete
  Tasks ohne Projektkontext.

Diese bestehende Logik bleibt in V1 wichtig und darf nicht versehentlich
gebrochen werden.

## Ziel von Slice 1

Slice 1 soll klaeren:

- wie `projects.type` modelliert wird
- wie bestehende Projects migriert werden
- wie `Inbox` als Category abgesichert wird
- wie die bestehende Inbox-Project-Logik einzuordnen ist
- welche Tests und Kontext-Auswirkungen bei der Umsetzung zwingend beachtet
  werden muessen

Nicht Ziel dieses Slice:

- UI bauen
- Agentenverhalten voll ausarbeiten
- Statusmodelle je Type definieren
- Recurrence einfuehren
- Code von `Project` zu `Initiative` umbenennen

## Entscheidung 1: Neues Feld `projects.type`

Das bestehende `projects`-Schema bekommt ein neues Feld:

```sql
type text not null default 'project'
  check (type in ('idea', 'project', 'habit'))
```

Begruendung:

- `not null`: Jede Initiative braucht genau einen Type.
- `default 'project'`: Bestehende Daten und bestehende Create-Pfade bleiben
  konservativ kompatibel.
- `check`: Ungueltige Werte werden auf DB-Ebene verhindert.
- `text`: Passt zur bestehenden SQLite-/TypeScript-Struktur fuer Statusfelder.

Die erlaubten Werte sind:

| Wert | Bedeutung |
| --- | --- |
| `idea` | Idee |
| `project` | konkretes Projekt |
| `habit` | Gewohnheit |

## Entscheidung 2: Bestehende Projects werden `project`

Alle bestehenden Eintraege in `projects` werden initial als `type = 'project'`
behandelt.

Das ist bewusst konservativ:

- Der heutige Bestand wurde unter dem bisherigen Projektmodell erstellt.
- Es vermeidet riskante automatische Klassifikation.
- Ideen und Habits koennen spaeter manuell oder agentisch umtypisiert werden,
  wenn die UI/Tools dafuer bereit sind.

## Entscheidung 3: Technischer Name bleibt vorerst `Project`

In Slice 1 bleibt der Code-Name `Project` bestehen.

Nicht umbenannt werden:

- Tabelle `projects`
- `ProjectRepository`
- API-Routen `/api/projects`
- Tool-Namen wie `createProject`
- Chat-Kontext `project`

Der fachliche Oberbegriff `Initiative` wird dokumentiert, aber nicht als
flächendeckendes technisches Rename-Refactoring umgesetzt.

## Entscheidung 4: Inbox Category wird systemisch abgesichert

Category bleibt Pflichtfeld.

`Inbox` wird als systemische Category verwendet, wenn die passende Category
fuer eine Idee, ein Projekt oder eine Habit noch unklar ist.

V1-Entscheidung:

- `Inbox` soll existieren.
- `Inbox` soll `is_system = 1` haben.
- Falls bereits eine Category `Inbox` existiert, soll sie auf `is_system = 1`
  gehoben werden.
- `Inbox` bleibt sichtbar und nutzbar.
- `Inbox` ist nicht `category = optional`, sondern eine echte Category.

Begruendung:

- Der Agent braucht einen stabilen Fallback-Ort.
- Die Architektur bleibt einfach, weil `category_id` weiter Pflicht bleibt.
- `is_system = 1` signalisiert: Diese Category ist Teil der Produktlogik und
  sollte nicht versehentlich geloescht oder umbenannt werden.

## Entscheidung 5: Bestehendes Inbox-Project bleibt vorerst bestehen

Es gibt schon ein systemisches Project `Inbox`, das fuer Tasks ohne
Projektkontext verwendet wird.

Das fuehrt zu zwei verwandten, aber unterschiedlichen Dingen:

- Category `Inbox`: Sammelstelle fuer unsortierte Initiativen
- Project `Inbox`: systemisches Capture-Project fuer konkrete Tasks ohne
  Projektkontext

V1 soll diese bestehende Struktur nicht aufbrechen.

Das systemische Project `Inbox` bekommt in der neuen Type-Logik:

```text
type = project
```

Begruendung:

- Es ist technisch ein Project-Container fuer Tasks.
- Es ist keine Idee.
- Es ist keine Habit.
- Bestehende Task-Capture-Logik bleibt kompatibel.

Spaeter kann separat geprueft werden, ob die doppelte Sprache
`Inbox Category` und `Inbox Project` in UI und Agentenkommunikation klar genug
ist oder anders dargestellt werden sollte.

## Entscheidung 6: Migration-Strategie

Die aktuelle Migrationstruktur nutzt `src/db/migrate.ts` plus
`data/schema.sql`.

Empfohlene Umsetzung:

1. `data/schema.sql` aktualisieren

   In `projects` wird `type` direkt in das Create-Table-Schema aufgenommen.

2. Bestehende Datenbanken migrieren

   In `src/db/migrate.ts` wird eine gezielte Migration ergaenzt:

   - pruefen, ob Tabelle `projects` existiert
   - pruefen, ob Spalte `type` existiert
   - falls nicht, Spalte mit `not null default 'project'` und Check ergaenzen
   - falls SQLite-Constraints per `alter table add column` nicht sauber genug
     sind, Tabelle kontrolliert rebuilden

3. `Inbox` nach Schema-Sicherung sicherstellen

   Nach dem Anlegen/Aktualisieren des Schemas soll `Inbox` als Category
   existieren und `is_system = 1` haben.

   Wichtig: Die heutige Methode `ensureSystemCategory(name)` gibt eine
   bestehende Category nur zurueck. Wenn bereits eine nicht-systemische Category
   `Inbox` existiert, wird sie damit nicht automatisch auf `is_system = 1`
   gehoben. Fuer V1 sollte diese Logik verbessert oder in der Migration
   explizit behandelt werden.

## Entscheidung 7: Indexing

V1 braucht wahrscheinlich keinen aggressiven neuen Index.

Sinnvoll und klein waere:

```sql
create index if not exists idx_projects_type on projects(type);
```

Optional spaeter:

```sql
create index if not exists idx_projects_category_type_sort_order
  on projects(category_id, type, sort_order, id);
```

Empfehlung fuer V1:

- `idx_projects_type` einfuehren, wenn `listProjects` direkt nach Type filtern
  soll.
- Den kombinierten Index erst einfuehren, wenn UI-Filter oder Performance das
  rechtfertigen.

## Entscheidung 8: TypeScript-Domain-Typen

In der spaeteren Umsetzung sollte ein expliziter Type eingefuehrt werden:

```ts
export type ProjectType = "idea" | "project" | "habit";
```

`Project` bekommt:

```ts
type: ProjectType;
```

`CreateProjectInput` bekommt:

```ts
type?: ProjectType;
```

`UpdateProjectInput` bekommt voraussichtlich:

```ts
type?: ProjectType;
```

Ob `updateProject` den Type in V1 schon bewusst aendern darf, ist eher eine
Tool-/Behavior-Frage. Technisch ist es sinnvoll, das Repository darauf
vorzubereiten. Der Agent sollte spaeter aber bei Type-Wechseln vorsichtig sein,
weil `idea -> project` oder `idea -> habit` fachliche Lifecycle-Uebergaenge
sind.

## Entscheidung 9: `listProjects` Type-Filter

`ProjectRepository.list` sollte in V1 optional nach `type` filtern koennen.

Empfohlen:

```ts
list(filters: {
  categoryId?: number;
  status?: ProjectStatus;
  type?: ProjectType;
} = {})
```

Begruendung:

- UI kann spaeter leicht Ideen, Projekte oder Habits getrennt anzeigen.
- Agent/Tools koennen gezielt nach Typen suchen.
- Der Filter ist klein und passt zum bestehenden Pattern.

## Entscheidung 10: Kontextresolver muss angepasst werden

`projects.type` ist kontextrelevant.

Bei Umsetzung muss `src/chat/conversation-context.ts` inspiziert und angepasst
werden.

Mindestens relevant:

- `formatProjectHeader(project)` sollte den Type enthalten.
- Project-Kontext sollte erkennen lassen, ob es eine Idee, ein Projekt oder
  eine Habit ist.
- Projects- und Category-Overview sollten Type anzeigen.

Der Test `tests/chat/context-schema-sync.test.ts` wird nach Schema-Aenderung
absichtlich fehlschlagen. Das ist korrekt. Erst nachdem der Kontextresolver
angepasst wurde, darf die erwartete Schema-Signatur aktualisiert werden.

## Umsetzungsauswirkungen

Bei der spaeteren Implementierung sind mindestens diese Dateien betroffen:

- `data/schema.sql`
- `src/db/migrate.ts`
- `src/repositories/projects.ts`
- `src/repositories/categories.ts`
- `src/tools/projects.ts`
- `src/tools/tasks.ts`
- `src/chat/conversation-context.ts`
- `web/src/types.ts`
- Tests fuer Repositories, Tools und Kontextresolver
- `tests/chat/context-schema-sync.test.ts`

`src/tools/tasks.ts` ist betroffen, weil das bestehende systemische
Inbox-Project bei Erstellung ebenfalls einen Type bekommen sollte.

## Testplan fuer die spaetere Umsetzung

Mindestens testen:

1. Frische DB enthaelt `projects.type` mit Default `project`.
2. Frische DB stellt Category `Inbox` mit `is_system = true` sicher.
3. Existing-DB-Migration ergaenzt `projects.type` fuer bestehende Projects.
4. Existing-DB-Migration hebt bestehende Category `Inbox` auf
   `is_system = true`.
5. `ProjectRepository.create` setzt Default `project`, wenn kein Type
   uebergeben wird.
6. `ProjectRepository.create` kann `idea` und `habit` erstellen.
7. `ProjectRepository.list({ type: "idea" })` filtert korrekt.
8. `updateProject` kann den Type technisch aktualisieren, sofern V1 das im Tool
   freigibt.
9. `createTask` mit `useInboxIfProjectMissing` erzeugt weiterhin ein
   systemisches Inbox-Project und dieses hat `type = project`.
10. Kontextresolver gibt den Type in Project-, Category- und Projects-Kontexten
    aus.

## Offene Detailfragen vor Implementierung

Diese Fragen sollten vor dem Code-Change entschieden werden:

- Soll `updateProject` in den Tools Type-Wechsel schon in V1 erlauben?
- Soll ein Type-Wechsel durch den Agenten bestaetigungspflichtig sein?
- Soll die API in V1 schon einen `type` Query-Filter fuer `/api/projects`
  bekommen?
- Soll `/api/app/overview` alle aktiven Typen gemeinsam liefern oder bereits
  optional typgefiltert werden?
- Soll `Inbox` automatisch bei jeder Migration angelegt werden oder nur beim
  ersten Bedarf?

## Empfehlung

Meine Empfehlung fuer die Umsetzung von Slice 1:

- `projects.type text not null default 'project' check (...)`
- bestehende Projects automatisch `project`
- `Inbox` Category immer sicherstellen und auf `is_system = 1` heben
- bestehendes systemisches Inbox-Project behalten und als `type = project`
  behandeln
- `ProjectRepository.list` direkt um optionalen `type`-Filter erweitern
- `ProjectRepository.create` und `update` technisch type-faehig machen
- Agentische Type-Wechsel spaeter vorsichtig regeln, nicht schon im
  Datenmodell-Slice ueberfrachten

Der naechste praktische Schritt waere die Implementierung genau dieses Slice.
