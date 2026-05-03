# Plan: Project Types

Stand: 2026-05-01

Dieses Dokument sichert das gemeinsame fachliche Verständnis zur geplanten
Einführung eines neuen Attributs `type` am bestehenden technischen Objekt
`Project`.

Es ist bewusst kein Implementierungsplan. Es trifft keine finalen Entscheidungen
zu Datenmodell, UI, UX, Statuslogik, Prompt Engineering oder Agentenverhalten.
Diese Themen werden nur als mögliche Auswirkungen und spätere Arbeitspakete
gesammelt.

Das technische Objekt heißt aktuell weiterhin `Project`. Fachlich soll dieses
Objekt perspektivisch als `Initiative` verstanden werden: eine bewusst
angelegte Sache, die d-max begleiten soll. Eine Initiative kann je nach `type`
eine Idee, ein konkretes Projekt oder eine Gewohnheit sein.

Diese Naming-Entscheidung bedeutet noch kein sofortiges Code-Refactoring. Sie
schärft zunächst die Domain Language. Der heutige Code, die Tabelle und viele
APIs können vorerst weiterhin `Project` heißen, während die Produkt- und
Fachsprache zunehmend mit dem Oberbegriff `Initiative` arbeitet.

Das neue Attribut `type` segmentiert diese Initiative fachlich in drei Typen:

| Deutscher Name | Englischer Name | Technischer Wert |
| --- | --- | --- |
| Idee | Idea | `idea` |
| Projekt | Project | `project` |
| Gewohnheit | Habit | `habit` |

Wichtig ist die begriffliche Trennung zwischen:

- dem heutigen technischen Objekt `Project`
- dem fachlichen Oberbegriff `Initiative`
- dem Project Type `project`

`type = project` beschreibt die konkrete, zielorientierte Projektart innerhalb
einer Initiative. Das löst die sprachliche Reibung, dass nicht jede Initiative
fachlich ein Projekt ist, obwohl die technische Entität heute noch `Project`
heißt.

## Teil A: Konzeptionelles Verständnis

### Ziel der Einführung von `type`

Das bestehende Objekt `Project` soll fachlich differenzierter werden. Heute
liegen in einem gemeinsamen Objekt potenziell sehr unterschiedliche Dinge:
lose Ideen, konkrete Vorhaben und dauerhaft gepflegte Lebensbereiche oder
Praktiken.

Mit `type` soll das System besser verstehen, was ein bestimmtes Project
fachlich ist:

- eine offene Idee, die noch sortiert, bewertet oder konkretisiert wird
- ein zielorientiertes Projekt, das aktiv umgesetzt und abgeschlossen werden
  kann
- eine Gewohnheit, die dauerhaft gepflegt, reflektiert und stabilisiert wird

Diese Unterscheidung soll später helfen, die passenden Felder, Views,
Statuslogiken, Maßnahmen, Erinnerungen und Agentenrollen je Typ zu entwickeln.
In diesem ersten Schritt geht es aber nur um das gemeinsame Verständnis.

### Gemeinsame Grundlage

Alle drei Typen bleiben zunächst technisch `Project`. Fachlich sind sie aber
Initiativen.

Eine Initiative ist ein bewusst angelegter Container für etwas, das d-max
begleiten soll. Je nach `type` ist diese Initiative:

- eine Idee, die gedacht, sortiert und bewertet wird
- ein Projekt, das geplant, umgesetzt und abgeschlossen werden kann
- eine Habit, die dauerhaft gepflegt und reflektiert wird

In der Kommunikation mit dem Nutzer sollen die Typnamen dominieren. Der Nutzer
sagt natürlicherweise eher:

- "Ich möchte eine neue Idee dokumentieren."
- "Lege ein neues Projekt an."
- "Ich möchte eine neue Gewohnheit starten."

Der Oberbegriff `Initiative` bleibt nützlich für Architektur, Modellierung,
Dokumentation und spätere Refactorings. Er muss aber nicht in jeder UI oder
jedem Agenten-Dialog sichtbar sein.

Alle drei Typen haben weiterhin eine Category. `category_id` bleibt fachlich und
technisch ein Pflichtkonzept. Für Fälle, in denen die passende Category noch
unklar ist, soll eine zusätzliche Category `Inbox` eingeführt werden.

Die `Inbox` ist damit kein Ersatz für Categories und keine Aufweichung der
Architektur. Sie ist die bewusste Sammelstelle für noch unsortierte Ideen,
Projekte oder andere Project-Einträge, deren fachliche Einordnung später
geklärt wird.

Maßnahmen bleiben im System fachlich die deutsche Entsprechung von Tasks.
Der technische oder englische Begriff ist `Task`. Andere Begriffe wie To-do,
Next Step oder Recurring Action sollen nicht aktiv als Systembegriffe verwendet
werden, weil sie nicht der natürlichen Sprache des Nutzers entsprechen.

### Type `idea`: Idee

Eine Idee ist ein lose formulierter Gedanke, ein Impuls, eine Möglichkeit oder
ein noch nicht konkretisiertes Vorhaben.

Eine Idee hat Brainstorming-Charakter. Sie kann unsortiert, unbewertet und noch
nicht entschieden sein. Sie kann bereits einer Category zugeordnet sein oder
zunächst in der `Inbox` liegen, wenn die passende Category noch unklar ist.

Eine Idee ist normalerweise nicht zeitgebunden. Sie hat typischerweise kein
klares Startdatum, kein klares Enddatum, keinen festen Aufwand, kein vollständig
definiertes Ziel und wenige oder gar keine konkreten Maßnahmen.

Das heißt nicht, dass Ideen keine Tasks haben können. Eine Idee kann Maßnahmen
haben, wenn diese helfen, die Idee zu klären oder entscheidungsfähig zu machen.
Solche Maßnahmen sind aber meist explorativer als bei einem Projekt.

Typische Maßnahmen bei Ideen:

- recherchieren
- konkretisieren
- Feedback einholen
- Optionen vergleichen
- Entscheidung vorbereiten
- Vor- und Nachteile herausarbeiten
- offene Fragen sammeln

#### Mindset bei Ideen

Bei Ideen geht es um Denken, Sammeln, Sortieren, Spiegeln, Abwägen, Bewerten,
Verbinden und Konkretisieren.

Die zentrale Frage ist nicht: "Wie setzen wir das jetzt um?", sondern eher:
"Was ist das eigentlich, warum könnte es wichtig sein, und soll daraus etwas
werden?"

Eine Idee darf unfertig sein. Sie darf bewusst noch keine Verpflichtung sein.

#### Rolle des Agenten bei Ideen

Bei Ideen soll der Agent vor allem als Sparringspartner und Ideation-Partner
auftreten.

Der Agent soll:

- Gedanken spiegeln
- offene Fragen stellen
- Ideen sortieren
- Ideen konkretisieren
- Vor- und Nachteile herausarbeiten
- Konflikte sichtbar machen
- eine begründete Meinung anbieten
- Verbindungen zu anderen Ideen erkennen
- Verbindungen zu Projekten erkennen
- Verbindungen zu Habits erkennen
- bei Bedarf recherchieren
- helfen, eine Idee weiterzuentwickeln oder bewusst zu verwerfen

Der Agent soll bei Ideen nicht zu schnell in eine Umsetzungslogik wechseln.
Der Wert liegt zunächst im Klären, Denken und Entscheiden.

#### Mögliche Lebenszyklen bei Ideen

Ideen haben einen anderen Lebenszyklus als konkrete Projekte oder Habits.
Mögliche fachliche Zustände oder Bewegungen sind:

- gesammelt
- sortiert
- bewertet
- konkretisiert
- verworfen
- archiviert
- in ein Projekt umgewandelt
- in eine Habit umgewandelt
- in ein bestehendes Projekt eingebracht
- in eine Maßnahme innerhalb eines Projekts oder einer Habit überführt

Diese Begriffe sind noch kein finales Statusmodell. Sie beschreiben nur das
fachliche Feld, das später in einer eigenen Statuslogik ausgearbeitet werden
muss.

### Type `project`: Projekt

Ein Projekt ist ein zielorientiertes Vorhaben.

Bei einem Projekt geht es darum, ein konkretes Ergebnis herbeizuführen. Es kann
ein Planungsprojekt, ein Umsetzungsprojekt, ein berufliches Vorhaben, ein
persönliches Vorhaben, ein organisatorisches Vorhaben oder ein anderes klar
fassbares Ergebnis in der echten Welt sein.

Ein Projekt sollte typischerweise ein klares Ziel haben. Es ist etwas, das aktiv
vorangetrieben und irgendwann abgeschlossen werden kann.

Wichtige Fragen bei Projekten:

- Worauf arbeiten wir hin?
- Was ist das gewünschte Ergebnis?
- Wann ist das Projekt fertig?
- Was gehört zum Scope?
- Was gehört nicht zum Scope?
- Welche konkreten Maßnahmen gibt es?
- Was ist der nächste sinnvolle Schritt?

Ein Projekt kann fachlich haben:

- Startdatum
- Enddatum
- Deadline
- geschätzten Aufwand
- Verantwortlichen
- Status
- Priorität
- Scope
- Zieldefinition
- Erfolgskriterien
- Tasks / Maßnahmen
- Termine
- Checklisten
- terminierte Maßnahmen
- nicht terminierte Maßnahmen
- Abhängigkeiten

Diese Liste ist keine finale Felddefinition. Sie beschreibt nur, welche
Informationen bei `type = project` naheliegend sind.

#### Mindset bei Projekten

Bei Projekten geht es um Planen, Entscheiden, Handeln, Koordinieren, Umsetzen,
Fortschritt und Abschluss.

Ein Projekt ist etwas, das man aktiv vorantreibt. Der Fokus liegt auf Handlung,
Umsetzung und Ergebnis.

#### Rolle des Agenten bei Projekten

Bei Projekten soll der Agent stärker als Planungs-, Umsetzungs- und
Ausführungsassistent auftreten.

Der Agent soll:

- Ziele schärfen
- Scope klären
- konkrete Maßnahmen ableiten
- Tasks erstellen
- Tasks priorisieren
- Checklisten erstellen
- Termine vorschlagen
- Deadlines berücksichtigen
- Umsetzungsschritte planen
- Recherche übernehmen
- Texte oder Dokumente vorbereiten
- Abstimmungen vorbereiten
- Fortschritt sichtbar machen
- dem Nutzer helfen, tatsächlichen Fortschritt zu erzeugen

Der Agent darf hier aktiver in Richtung Ausführung denken als bei Ideen. Dabei
gelten weiterhin die bestehenden Regeln: dauerhafte Änderungen laufen über Tools
und unklare oder riskante Änderungen brauchen Klärung oder Bestätigung.

#### Mögliche Lebenszyklen bei Projekten

Projekte haben einen anderen Lebenszyklus als Ideen und Habits.

Fachlich naheliegende Zustände oder Bewegungen sind:

- aktiv
- pausiert
- blockiert
- abgeschlossen
- archiviert
- aus einer Idee entstanden
- in kleinere Projekte oder Maßnahmen aufgeteilt

Auch das ist noch kein finales Statusmodell. Das spätere Status-System muss
klären, welche Zustände tatsächlich gebraucht werden, welche davon typabhängig
sind und wie Übergänge sauber abgebildet werden.

### Type `habit`: Gewohnheit

Eine Habit ist kein klassisches Projekt, weil sie normalerweise kein klares Ende
hat.

Eine Habit beschreibt einen Lebensbereich, eine wiederkehrende Praxis oder eine
langfristige Qualität, die gepflegt werden soll. Sie ist in der Regel ein
dauerhaft aktiver Container.

Eine Habit ist nicht auf ein einmaliges Ergebnis ausgerichtet. Stattdessen geht
es darum, langfristig einen Zustand, eine Qualität oder einen Lebensbereich zu
pflegen.

Beispiele:

- Freundschaften pflegen
- Familie unterstützen
- für einen starken und gesunden Körper sorgen
- mentale Gesundheit pflegen
- Vitalität erhalten
- spirituelle Praxis entwickeln
- finanzielle Stabilität pflegen
- unternehmerische Energie erhalten
- Kundenbeziehungen regelmäßig pflegen

Ein Projekt könnte sein: "10 neue Kunden gewinnen". Wenn 10 Kunden gewonnen
wurden, ist das Projekt abgeschlossen.

Eine Habit wäre dagegen: "Kundenbeziehungen regelmäßig pflegen". Diese Habit
ist nicht abgeschlossen, sondern wird dauerhaft kultiviert.

Eine Habit hat normalerweise kein festes Enddatum. Eine Ausnahme ist möglich,
wenn der Nutzer eine Habit bewusst beendet, zum Beispiel: "Das mache ich nicht
mehr."

#### Maßnahmen bei Habits

Maßnahmen bei Habits sind häufig wiederkehrende Tasks.

Sie können zum Beispiel wiederkehren:

- täglich
- wöchentlich
- zweiwöchentlich
- monatlich
- quartalsweise
- jährlich

Recurrence ist aktuell noch nicht implementiert, wird aber für Habits künftig
wichtig. Dasselbe gilt für die genauere Terminierung von Projekten und Tasks:
fixe Zeitpunkte, ganztägige Termine und wiederkehrende Zeitlogik sind spätere
Arbeitsfelder, aber nicht Fokus dieses Dokuments.

#### Mindset bei Habits

Bei Habits geht es um Pflegen, Wiederholen, Stabilisieren, Reflektieren,
Balancieren, langfristiges Kultivieren und Lebensqualität.

Ein Projekt ist etwas, das man durchzieht.

Eine Habit ist etwas, um das man sich regelmäßig kümmert.

#### Rolle des Agenten bei Habits

Bei Habits soll der Agent eher als Coach, Motivator, Reflexionspartner und
Accountability-Partner auftreten.

Der Agent soll:

- an wiederkehrende Maßnahmen erinnern
- Fortschritt reflektieren
- Muster erkennen
- den Nutzer motivieren
- sanft nachhaken
- Balance zwischen Projekten und Lebensqualität beachten
- Zusammenhänge zwischen Verhalten, Stimmung und Energie erkennen
- Empfehlungen geben
- Überforderung sichtbar machen
- auf Selbstfürsorge hinweisen
- helfen, Lebensbereiche bewusst zu pflegen

Beispiel: Wenn der Nutzer eine Habit "Sport machen" hat und diese Woche erst
einmal Sport gemacht hat, könnte der Agent motivierend darauf hinweisen, dass
noch eine zweite Einheit sinnvoll wäre.

Ein weiteres Beispiel: Wenn der Nutzer viele Stunden in Projekten arbeitet,
aber gleichzeitig erschöpft, traurig oder emotional belastet ist, sollte der
Agent erkennen können, dass möglicherweise Selbstfürsorge, Regeneration oder
soziale Verbindung zu kurz kommen.

Der Agent könnte dann vorschlagen:

- bewusst Pause zu machen
- Zeit für Reflexion einzuplanen
- Kontakt zu Freunden aufzunehmen
- Sport oder Spaziergang einzuplanen
- Journaling zu machen
- emotionale Muster zu reflektieren

Der Agent soll bei Habits also nicht nur Tasks verwalten, sondern helfen,
Lebensqualität, Freude, Gesundheit, Beziehungen, unternehmerische Energie und
persönliche Entwicklung zu fördern.

#### Mögliche Lebenszyklen bei Habits

Habits sind in der Regel dauerhaft aktiv.

Fachlich naheliegende Zustände oder Bewegungen sind:

- aktiv gepflegt
- stabil
- vernachlässigt
- pausiert
- bewusst beendet
- archiviert
- aus einer Idee entstanden

Auch diese Begriffe sind noch kein finales Statusmodell. Sie markieren nur, dass
Habits eine andere Lebenszykluslogik brauchen als Ideen und Projekte.

### Vergleich der drei Typen

| Dimension | `idea` | `project` | `habit` |
| --- | --- | --- | --- |
| Kern | Möglichkeit, Impuls, Gedanke | Zielorientiertes Vorhaben | Dauerhaft gepflegte Praxis |
| Primäre Frage | Soll daraus etwas werden? | Wie erreichen wir das Ergebnis? | Wie pflegen wir das regelmäßig? |
| Zeitlogik | meist offen | häufig terminiert oder abschließbar | langfristig, wiederkehrend |
| Abschluss | kann verworfen, archiviert oder überführt werden | sollte abschließbar sein | normalerweise kein festes Ende |
| Maßnahmen | explorativ, klärend | konkret, handlungsorientiert | häufig wiederkehrend |
| Agentenrolle | Sparringspartner | Planungs- und Umsetzungsassistent | Coach und Accountability-Partner |
| Nutzer-Mindset | denken, sortieren, bewerten | planen, handeln, abschließen | pflegen, reflektieren, stabilisieren |
| Typischer Ort bei Unklarheit | `Inbox` | `Inbox` oder passende Category | eher passende Category, notfalls `Inbox` |

### Domain Language

Die geplante Domain Language lautet:

- `Initiative`: fachlicher Oberbegriff für den Container, den d-max begleitet
- `idea`: technische Type-Bezeichnung für Idee
- `project`: technische Type-Bezeichnung für konkretes Projekt
- `habit`: technische Type-Bezeichnung für Gewohnheit
- `Project`: aktueller technischer Name im bestehenden Code
- `Task`: technischer englischer Begriff für Maßnahme
- Maßnahme: natürliche deutsche Nutzer- und Agentensprache für Task

Die Nutzerkommunikation soll nicht künstlich den Oberbegriff erzwingen. Wenn
der Nutzer eine Idee meint, soll der Agent von einer Idee sprechen. Wenn der
Nutzer ein Projekt meint, soll der Agent von einem Projekt sprechen. Wenn der
Nutzer eine Gewohnheit meint, soll der Agent von einer Gewohnheit sprechen.

`Initiative` ist der zusammenfassende Begriff für Fälle, in denen der
Oberbegriff wirklich gebraucht wird, zum Beispiel in konzeptioneller
Dokumentation, Architekturentscheidungen oder späteren Datenmodellfragen.

### Typische Übergänge

Die Einführung von Project Types macht Übergänge zwischen fachlichen Zuständen
wichtig.

Naheliegende Übergänge:

- Idee wird zu Projekt
- Idee wird zu Habit
- Idee fließt in ein bestehendes Projekt ein
- Idee wird zu einer Maßnahme in einem Projekt
- Idee wird zu einer Maßnahme in einer Habit
- Projekt wird abgeschlossen und archiviert
- Habit wird bewusst beendet und archiviert
- Project-Eintrag wird aus `Inbox` in eine passende Category verschoben

Besonders wichtig sind die Übergänge `idea -> project` und `idea -> habit`.
Das spätere Status-System muss diese Übergänge sauber abbilden können.

Noch offen ist, ob eine Umwandlung konzeptionell immer dieselbe technische
Entität mit geändertem `type` bleibt, ob bestimmte Fälle eine Ableitung erzeugen
sollten, oder ob Historie separat betrachtet werden muss. Diese Frage gehört in
ein späteres Arbeitspaket.

### Mögliche Auswirkungen

Die Einführung von `type` kann Auswirkungen auf mehrere Produktbereiche haben.
Diese Punkte sind mögliche Arbeitsfelder, keine finalen Entscheidungen.

#### Datenmodell

- neues Attribut `type` am heutigen technischen Objekt `Project`
- fachlicher Oberbegriff `Initiative` als Ziel-Sprache
- mögliche spätere Umbenennung von Code-/API-/Tabellenkonzepten prüfen
- Pflichtwerte `idea`, `project`, `habit`
- Default für bestehende Projects
- Einführung oder Sicherstellung einer Category `Inbox`
- mögliche typabhängige Statuslogik
- mögliche spätere Zeit- und Recurrence-Felder
- Auswirkungen auf Tasks / Maßnahmen
- Auswirkungen auf `projects.parent_id`
- Auswirkungen auf Sortierung, Filterung und Archivierung

#### Kontext und Agent

- typabhängige Kontextdaten für OpenClaw
- typabhängige Agentenrolle
- andere Gesprächsführung bei Ideen, Projekten und Habits
- andere Vorschläge für Maßnahmen
- andere Bestätigungs- und Übergangslogik
- Verbindungen zwischen Ideen, Projekten und Habits
- Coaching- und Accountability-Verhalten für Habits

#### UI und UX

- Navigation zwischen Ideen, Projekten und Habits
- mögliche Hauptbereiche oder Filter
- List Views je Typ
- Detail Views je Typ
- sichtbare Felder je Typ
- Umgang mit `Inbox`
- Darstellung von Lifecycle-Übergängen
- Darstellung wiederkehrender Maßnahmen
- Fokus-Management für aktive Projekte
- Reflexions- und Verlaufsansichten für Habits

#### Zeitlogik

- Terminierung von Projekten
- Terminierung von Tasks / Maßnahmen
- fixe Zeitpunkte
- ganztägige Termine
- wiederkehrende Tasks
- Erinnerungen
- Kalenderintegration

Diese Zeitlogik ist künftig relevant, aber nicht Fokus dieses ersten
Konzeptdokuments.

## Teil B: Roadmap / Folgeaufgaben

Die folgenden Punkte sind spätere, einzeln planbare Arbeitspakete. Sie sind
bewusst noch nicht detailliert ausgearbeitet.

1. Datenmodell für Project Types ausarbeiten

   Klären, wie `type` am bestehenden technischen Objekt `Project` modelliert
   wird, welche Werte erlaubt sind, welcher Default sinnvoll ist und wie die
   bestehende Repository-/API-/Tool-Struktur davon betroffen wäre. Dabei
   berücksichtigen, dass der fachliche Oberbegriff perspektivisch `Initiative`
   ist.

2. Domain Language und Naming-Strategie finalisieren

   Festlegen, wo `Initiative` als Oberbegriff verwendet wird, wo weiterhin die
   Typnamen Idee, Projekt und Gewohnheit dominieren, und ob beziehungsweise
   wann ein technisches Refactoring von `Project` zu `Initiative` sinnvoll ist.
   Dieses Refactoring ist nicht automatisch Teil der ersten Umsetzung.

3. Migration bestehender Projects planen

   Festlegen, wie bestehende Projects initial typisiert werden. Wahrscheinlich
   wird `project` als konservativer Default naheliegen, aber das muss bewusst
   entschieden werden.

4. Category `Inbox` konzipieren und absichern

   Klären, wie `Inbox` eingeführt wird, ob sie System-Category sein soll, wie
   sie sortiert wird und wie der Agent sie bei unklarer Einordnung nutzt.

5. Statusmodelle je Project Type ausarbeiten

   Ideen, Projekte und Habits haben unterschiedliche Lebenszyklen. Später muss
   geklärt werden, ob ein gemeinsames Statusfeld reicht, ob typabhängige Werte
   nötig sind und wie Übergänge wie `idea -> project` und `idea -> habit`
   abgebildet werden.

6. Lifecycle-Übergänge zwischen Typen definieren

   Ausarbeiten, was fachlich und technisch passiert, wenn eine Idee zu einem
   Projekt oder einer Habit wird, in ein bestehendes Projekt einfließt oder in
   eine Maßnahme überführt wird.

7. Task-/Maßnahmenmodell prüfen

   Klären, wie Tasks bei Ideen, Projekten und Habits fachlich verwendet werden,
   ohne neue Systembegriffe einzuführen. Besonders wichtig ist die spätere
   Beziehung zwischen Habits und wiederkehrenden Tasks.

8. Recurrence und Zeitlogik separat planen

   Wiederkehrende Tasks, fixe Zeitpunkte, ganztägige Termine, Terminierung von
   Projekten und Tasks sowie Kalenderintegration in einem eigenen Schritt
   ausarbeiten.

9. UI-Navigation für Ideen, Projekte und Habits entwerfen

   Klären, ob die drei Typen eigene Hauptbereiche, Filter, Tabs oder andere
   Navigationsmuster bekommen sollen.

10. List Views je Project Type konzipieren

   Erarbeiten, welche Informationen in Listen für Ideen, Projekte und Habits
   sichtbar sein sollen und wie `Inbox`, Category und Status dort wirken.

11. Detail Views je Project Type konzipieren

    Ausarbeiten, welche Felder, Markdown-Strukturen, Maßnahmenbereiche,
    Reflexionsbereiche oder Verlaufselemente pro Typ sinnvoll sind.

12. Prompt Engineering je Typ entwickeln

    Später definieren, wie der Agent in Kontexten mit `idea`, `project` und
    `habit` instruiert wird, ohne die bestehenden Tool- und Confirmation-Regeln
    zu verletzen.

13. Agentenverhalten je Typ spezifizieren

    Die fachlichen Rollen Sparringspartner, Umsetzungsassistent und Coach in
    konkrete Gesprächsmuster, Grenzen und Tool-Nutzungsregeln übersetzen.

14. Coaching- und Accountability-Logik für Habits entwerfen

    Klären, wie der Agent Fortschritt reflektiert, motivierend nachhakt,
    Überforderung erkennt und Lebensqualität berücksichtigt.

15. Fokus-Management für aktive Projekte konzipieren

    Ausarbeiten, wie d-max dem Nutzer hilft, aktive Projekte zu priorisieren,
    nicht zu viele Dinge gleichzeitig zu starten und echten Fortschritt zu
    erzeugen.

16. Inbox- und Category-Logik für Ideen klären

    Definieren, wie Ideen in der `Inbox` gesammelt, später sortiert und in
    passende Categories verschoben werden.

17. Kalender- und Erinnerungslogik je Typ prüfen

    Später klären, welche Termine, Erinnerungen und Kalenderverbindungen für
    Ideen, Projekte und Habits jeweils sinnvoll sind.

18. Archivierungs-, Abschluss- und Beendigungslogik definieren

    Unterscheiden, was Verwerfen einer Idee, Abschließen eines Projekts und
    bewusstes Beenden einer Habit fachlich und technisch bedeuten.

19. Kontextresolver und Tests bei späterer Umsetzung synchronisieren

    Bei jeder späteren Schema- oder Domänenänderung prüfen, ob
    `src/chat/conversation-context.ts` vollständige und korrekte Kontextdaten an
    OpenClaw liefert. Der bestehende Test
    `tests/chat/context-schema-sync.test.ts` ist bewusst als Guard relevant.

20. OpenClaw Workspace Memory aktualisieren

    Wenn das Verhalten später umgesetzt wird, müssen die kurzen Runtime-Regeln
    in `openclaw/workspace/AGENTS.md` und `openclaw/workspace/TOOLS.md`
    typbewusst und knapp erweitert werden.

## Offene Fragen

Diese Fragen sind bewusst offen und sollen später einzeln geklärt werden:

- Bleibt eine Idee bei Umwandlung in ein Projekt oder eine Habit dieselbe
  technische Entität mit geändertem `type`, oder braucht es in manchen Fällen
  Historie oder Ableitungen?
- Welche Statuswerte sind wirklich pro Typ nötig?
- Reicht ein gemeinsames Statusfeld mit typabhängiger Bedeutung, oder braucht
  es eine andere Modellierung?
- Wie genau sollen wiederkehrende Tasks modelliert werden?
- Wann lohnt sich ein technisches Refactoring von `Project` zu `Initiative`,
  und wann ist es besser, nur die Fachsprache zu ändern?
- Wo soll `Initiative` in der UI sichtbar sein, und wo sollen ausschließlich
  Idee, Projekt und Gewohnheit sichtbar sein?
- Wie stark soll der Agent bei Habits proaktiv erinnern oder coachen?
- Wie wird verhindert, dass Habits zu einem zu lauten Erinnerungssystem werden?
- Welche Informationen gehören in Markdown-Memory, und welche sollten
  strukturierte Felder werden?
- Wie werden bestehende Projects zuverlässig und ohne Datenverlust typisiert?
- Wie sichtbar soll `Inbox` in Navigation und UI sein?
- Wie werden Verbindungen zwischen Ideen, Projekten und Habits dargestellt?

Dieses Dokument ist damit die fachliche Grundlage für spätere Produkt- und
Implementierungsentscheidungen. Es entscheidet noch nicht, wie diese Änderungen
technisch umgesetzt werden.
