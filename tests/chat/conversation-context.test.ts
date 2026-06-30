import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GmailRepository } from "../../src/gmail/gmail-repository.js";
import { listPromptTemplates, resolveConversationContext } from "../../src/chat/conversation-context.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRelationRepository } from "../../src/repositories/initiative-relations.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { MediaAssetRepository } from "../../src/repositories/media-assets.js";
import { MediaLinkRepository } from "../../src/repositories/media-links.js";
import { EntityParticipantRepository, OrganizationRepository, PartyAddressRepository, PartyContactPointRepository, PartyRelationshipRepository, PersonRepository, RelationshipTypeRepository } from "../../src/repositories/parties.js";
import { PartyTimelineRepository } from "../../src/repositories/party-timeline.js";
import { TaskChecklistItemRepository } from "../../src/repositories/task-checklist-items.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("resolveConversationContext", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("builds a category context block", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiatives = new InitiativeRepository(db);
    const idea = initiatives.create({
      categoryId: category.id,
      type: "idea",
      name: "Agent Prompt Idee",
      markdown: "# Idee\n\nMehr Kontextklarheit fuer den Agenten."
    });
    const project = initiatives.create({
      categoryId: category.id,
      type: "project",
      name: "DMAX",
      startDate: "2026-05-02",
      endDate: "2026-06-15",
      markdown: "# Projekt\n\nPrompt-Kontext sauber strukturieren."
    });
    const habit = initiatives.create({
      categoryId: category.id,
      type: "habit",
      name: "Prompt Review",
      markdown: "# Gewohnheit\n\nRegelmaessig Prompt-Qualitaet pruefen."
    });
    new TaskRepository(db).create({ initiativeId: idea.id, title: "Idea context pruefen" });
    new TaskRepository(db).create({ initiativeId: project.id, title: "Add contextual chat", priority: "urgent" });
    new TaskRepository(db).create({ initiativeId: habit.id, title: "Habit context pruefen" });

    const resolved = resolveConversationContext(db, { type: "category", categoryId: category.id });

    expect(resolved.contextType).toBe("category");
    expect(resolved.contextEntityId).toBe(category.id);
    expect(resolved.agentContextBlock).toContain("Typ: category");
    expect(resolved.agentContextBlock).toContain("Bedeutung: Kategorie-Agent = Lebensbereichs-Coach + Alignment-Pruefer.");
    expect(resolved.agentContextBlock).toContain("Business");
    expect(resolved.agentContextBlock).toContain("Ideen in diesem Lebensbereich (1):");
    expect(resolved.agentContextBlock).toContain("Agent Prompt Idee");
    expect(resolved.agentContextBlock).toContain("Mehr Kontextklarheit fuer den Agenten.");
    expect(resolved.agentContextBlock).toContain("Projekte in diesem Lebensbereich (1):");
    expect(resolved.agentContextBlock).toContain("DMAX");
    expect(resolved.agentContextBlock).toContain("Prompt-Kontext sauber strukturieren.");
    expect(resolved.agentContextBlock).toContain("Gewohnheiten in diesem Lebensbereich (1):");
    expect(resolved.agentContextBlock).toContain("Prompt Review");
    expect(resolved.agentContextBlock).toContain("Regelmaessig Prompt-Qualitaet pruefen.");
    expect(resolved.agentContextBlock).toContain("2026-05-02 to 2026-06-15");
    expect(resolved.agentContextBlock).toContain("Add contextual chat");
    expect(resolved.agentContextBlock).toContain("Kontextvertrag:");
    expect(resolved.agentContextBlock).toContain("Regeln fuer Lebensbereich-/Category-Beschreibungen:");
    expect(resolved.agentContextBlock).toContain("Category-Detail-Facilitation-Modus");
    expect(resolved.agentContextBlock).toContain("Scope / Abgrenzung");
    expect(resolved.agentContextBlock).toContain("Ideen: vorhandene und moegliche Ideen zum Zielzustand");
    expect(resolved.agentContextBlock).toContain("Verbindung zwischen Ist-Zustand und Zielbild");
    expect(resolved.agentContextBlock).toContain("Nutze updateCategory erst, nachdem Dietrich der Formulierung zugestimmt hat.");
    expect(resolved.agentContextBlock).not.toContain("Meaning: Focused on one life area/category");
  });

  it("uses distinct instructions for category overview and initiatives overview", () => {
    new CategoryRepository(db).create({ name: "Business" });

    const categories = resolveConversationContext(db, { type: "categories" });
    const initiatives = resolveConversationContext(db, { type: "initiatives" });

    expect(categories.contextType).toBe("categories");
    expect(categories.agentContextBlock).toContain("Type: categories");
    expect(categories.agentContextBlock).toContain("Category-Overview-Modus");
    expect(categories.agentContextBlock).toContain("thematischer globaler Lebensmodell-Agent");
    expect(categories.agentContextBlock).toContain("Sind meine Lebensbereiche");
    expect(categories.agentContextBlock).not.toContain("Category-Detail-Facilitation-Modus");
    expect(initiatives.contextType).toBe("initiatives");
    expect(initiatives.agentContextBlock).toContain("Type: initiatives");
    expect(initiatives.agentContextBlock).toContain("Initiativen-Overview-Modus");
    expect(initiatives.agentContextBlock).toContain("globaler Alignment-Agent");
    expect(initiatives.agentContextBlock).toContain("Pruefe von den Initiativen aus");
    expect(initiatives.agentContextBlock).not.toBe(categories.agentContextBlock);
  });

  it("includes the shared flexible response policy in runtime contexts and prompt templates", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const project = new InitiativeRepository(db).create({ categoryId: category.id, type: "project", name: "Response Contract Project" });

    const resolved = resolveConversationContext(db, { type: "project", initiativeId: project.id });
    const projectTemplate = listPromptTemplates().find((template) => template.id === "projects-detail");

    expect(resolved.agentContextBlock).toContain("Response policy:");
    expect(resolved.agentContextBlock).toContain("Beantworte zuerst die konkrete Nutzerfrage");
    expect(resolved.agentContextBlock).toContain("maximal eine gute Frage auf einmal");
    expect(resolved.agentContextBlock).toContain("nicht automatisch am Ende jeder Antwort eine Frage");
    expect(resolved.agentContextBlock).toContain("klarer naechster Schritt ausreicht");
    expect(resolved.agentContextBlock).toContain("Response-Strukturen als Orientierung, nicht als starres Formular");
    expect(projectTemplate?.systemInstructions).toContain("Response policy:");
    expect(projectTemplate?.systemInstructions).toContain("Beantworte zuerst die konkrete Nutzerfrage");
    expect(projectTemplate?.systemInstructions).toContain("Wenn ein klarer naechster Schritt ausreicht");
    expect(projectTemplate?.systemInstructions).toContain("Response-Strukturen als Orientierung, nicht als starres Formular");
  });

  it("exposes response guidance contracts for the ten core context modes through prompt templates", () => {
    const templates = new Map(listPromptTemplates().map((template) => [template.id, template.systemInstructions]));

    const categories = templates.get("categories-list") ?? "";
    const category = templates.get("category-detail") ?? "";
    const initiatives = templates.get("initiatives-overview") ?? "";
    const ideas = templates.get("ideas-list") ?? "";
    const idea = templates.get("ideas-detail") ?? "";
    const projects = templates.get("projects-list") ?? "";
    const project = templates.get("projects-detail") ?? "";
    const habits = templates.get("habits-list") ?? "";
    const habit = templates.get("habits-detail") ?? "";
    const task = templates.get("tasks-detail") ?? "";

    expect(categories).toContain("Response Guidance:");
    expect(categories).toContain("Gesamtbild der Lebensbereiche");
    expect(categories).toContain("Luecken zwischen Lebensbereich und Initiativen");

    expect(category).toContain("Response Guidance:");
    expect(category).toContain("Scope, aktueller Zustand, Schmerz/Spannung, Zielbild/gewuenschte Qualitaet");
    expect(category).toContain("explizite Labels");
    expect(category).toContain("Aktueller Zustand");
    expect(category).toContain("Schmerz / Spannung");
    expect(category).toContain("Zielbild / gewuenschte Qualitaet");
    expect(category).toContain("Initiativen-Passung");
    expect(category).toContain("Luecken");

    expect(initiatives).toContain("Response Guidance:");
    expect(initiatives).toContain("Gleiche Initiativen gegen Lebensbereichsbeschreibungen ab");
    expect(initiatives).toContain("unterversorgte Lebensbereiche");
    expect(initiatives).not.toBe(categories);

    expect(ideas).toContain("Ideencluster");
    expect(ideas).toContain("Reifegrade");
    expect(ideas).toContain("angrenzende Ideen");

    expect(idea).toContain("Moeglichkeitsraum");
    expect(idea).toContain("Motivation");
    expect(idea).toContain("Hypothesen");
    expect(idea).toContain("Recherche- und Inputfelder");
    expect(idea).toContain("insgesamt etwa 5-7 priorisierte Punkte");
    expect(idea).toContain("Nicht 3-5 Punkte pro Untergruppe");
    expect(idea).toContain("maximal 3-4 kurze Abschnitte");
    expect(idea).toContain("vollstaendige Variantenraeume nur anbieten");
    expect(idea).toContain("maximaler Breite");
    expect(idea).toContain("Kleine Experimente");
    expect(idea).not.toContain("Definition of Done");

    expect(projects).toContain("Aufmerksamkeitsbedarf");
    expect(projects).toContain("Blocker");
    expect(projects).toContain("Task-Luecken");

    expect(project).toContain("Motivation");
    expect(project).toContain("Ziel/gewuenchtes Ergebnis");
    expect(project).toContain("Scope/Nicht-Scope");
    expect(project).toContain("Definition of Done");
    expect(project).toContain("Taskstruktur");
    expect(project).toContain("klaere zuerst diese Projektdefinition");
    expect(project).toContain("hoechstens die 3 wichtigsten Taskstruktur-Luecken");
    expect(project).toContain("Umfangreiche Tasklisten");

    expect(habits).toContain("gepflegte Qualitaeten");
    expect(habits).toContain("ungepflegte Qualitaeten");
    expect(habits).toContain("fehlende Pflegehandlungen");

    expect(habit).toContain("gewuenschte Qualitaet");
    expect(habit).toContain("Pflegehandlungen");
    expect(habit).toContain("Frequenzen");
    expect(habit).toContain("Minimalversion");
    expect(habit).toContain("echtem Enddatum");

    expect(task).toContain("Task-Klarheit");
    expect(task).toContain("gewuenschtes Outcome");
    expect(task).toContain("Schnitt/Splitting");
    expect(task).toContain("sibling tasks");
    expect(task).toContain("Loesungsweg");
    expect(task).toContain("Tools");
  });

  it("builds type-specific collection contexts for ideas, projects, habits, and tasks", () => {
    const category = new CategoryRepository(db).create({
      name: "Travel",
      description: "# Zielbild\n\nReisen soll neugierig, leicht und gut vorbereitet sein."
    });
    const initiatives = new InitiativeRepository(db);
    const tasks = new TaskRepository(db);
    const idea = initiatives.create({ categoryId: category.id, type: "idea", name: "Neuseeland-Route", summary: "Loose route ideas." });
    const project = initiatives.create({ categoryId: category.id, type: "project", name: "Reiserad kaufen" });
    const habit = initiatives.create({ categoryId: category.id, type: "habit", name: "Wochenreview" });
    tasks.create({ initiativeId: idea.id, title: "Idee sortieren" });
    tasks.create({ initiativeId: project.id, title: "Haendler anrufen" });
    tasks.create({ initiativeId: habit.id, title: "Review vorbereiten" });

    const ideas = resolveConversationContext(db, { type: "ideas" });
    const projects = resolveConversationContext(db, { type: "projects" });
    const habits = resolveConversationContext(db, { type: "habits" });
    const taskList = resolveConversationContext(db, { type: "tasks" });

    expect(ideas.contextType).toBe("ideas");
    expect(ideas.agentContextBlock).toContain("Type: ideas");
    expect(ideas.agentContextBlock).toContain("Ideenlisten-Modus");
    expect(ideas.agentContextBlock).toContain("Category background");
    expect(ideas.agentContextBlock).toContain("Reisen soll neugierig");
    expect(ideas.agentContextBlock).toContain("Neuseeland-Route");
    expect(ideas.agentContextBlock).toContain("Cross-type context in this life area");
    expect(ideas.agentContextBlock).toContain("Reiserad kaufen");
    expect(ideas.agentContextBlock).toContain("Wochenreview");
    expect(projects.contextType).toBe("projects");
    expect(projects.agentContextBlock).toContain("Projektlisten-Modus");
    expect(projects.agentContextBlock).toContain("Reiserad kaufen");
    expect(projects.agentContextBlock).toContain("Neuseeland-Route");
    expect(projects.agentContextBlock).toContain("Wochenreview");
    expect(habits.contextType).toBe("habits");
    expect(habits.agentContextBlock).toContain("Gewohnheitenlisten-Modus");
    expect(habits.agentContextBlock).toContain("Wochenreview");
    expect(habits.agentContextBlock).toContain("Neuseeland-Route");
    expect(habits.agentContextBlock).toContain("Reiserad kaufen");
    expect(taskList.contextType).toBe("tasks");
    expect(taskList.agentContextBlock).toContain("Open tasks across DMAX");
    expect(taskList.agentContextBlock).toContain("Haendler anrufen");
  });

  it("builds an idea detail context with category background, tasks, and same-category neighbors", () => {
    const category = new CategoryRepository(db).create({
      name: "Creative Work",
      description: "# Zielbild\n\nMehr kreative Experimente mit klarem Motiv und ohne vorschnelle Projektlogik."
    });
    const initiatives = new InitiativeRepository(db);
    const idea = initiatives.create({
      categoryId: category.id,
      type: "idea",
      name: "Essay-Serie",
      markdown: "# Idee\n\nMehrere Perspektiven auf DMAX als Lebenssystem sammeln."
    });
    initiatives.create({ categoryId: category.id, type: "idea", name: "Podcast-Notizen" });
    initiatives.create({ categoryId: category.id, type: "project", name: "Website-Relaunch" });
    initiatives.create({ categoryId: category.id, type: "habit", name: "Schreibfenster" });
    new TaskRepository(db).create({ initiativeId: idea.id, title: "Motive fuer Essay-Serie sammeln" });

    const resolved = resolveConversationContext(db, { type: "idea", initiativeId: idea.id });

    expect(resolved.agentContextBlock).toContain("Ideen-Detail-Modus");
    expect(resolved.agentContextBlock).toContain("Moeglichkeitsraeume");
    expect(resolved.agentContextBlock).toContain("Nicht zu frueh operationalisieren");
    expect(resolved.agentContextBlock).toContain("Category background");
    expect(resolved.agentContextBlock).toContain("Mehr kreative Experimente");
    expect(resolved.agentContextBlock).toContain("Motive fuer Essay-Serie sammeln");
    expect(resolved.agentContextBlock).toContain("Same-category neighborhood");
    expect(resolved.agentContextBlock).toContain("Podcast-Notizen");
    expect(resolved.agentContextBlock).toContain("Website-Relaunch");
    expect(resolved.agentContextBlock).toContain("Schreibfenster");
    expect(resolved.agentContextBlock).not.toContain("Projekt-Agent = Scope-Klaerer");
  });

  it("builds a project detail context with category background, parent/child initiatives, tasks, and cross-type neighbors", () => {
    const category = new CategoryRepository(db).create({
      name: "Business",
      description: "# Scope\n\nDMAX soll als tragfaehiges Produkt mit klarer Definition of Done wachsen."
    });
    const initiatives = new InitiativeRepository(db);
    const parent = initiatives.create({ categoryId: category.id, type: "project", name: "DMAX Produktlinie" });
    const project = initiatives.create({
      categoryId: category.id,
      parentId: parent.id,
      type: "project",
      name: "Prompt Context Phase 1",
      markdown: "# Ziel\n\nKontextmodi, Scope und Tasks besser strukturieren."
    });
    initiatives.create({ categoryId: category.id, parentId: project.id, type: "project", name: "Prompt Inspector Debug JSON" });
    initiatives.create({ categoryId: category.id, type: "idea", name: "Prompt Experimente" });
    initiatives.create({ categoryId: category.id, type: "habit", name: "Prompt Review Routine" });
    new TaskRepository(db).create({ initiativeId: project.id, title: "Definition of Done formulieren" });

    const resolved = resolveConversationContext(db, { type: "project", initiativeId: project.id });

    expect(resolved.agentContextBlock).toContain("Projekt-Detail-Modus");
    expect(resolved.agentContextBlock).toContain("Definition of Done");
    expect(resolved.agentContextBlock).toContain("Scope");
    expect(resolved.agentContextBlock).toContain("Category background");
    expect(resolved.agentContextBlock).toContain("tragfaehiges Produkt");
    expect(resolved.agentContextBlock).toContain("Parent initiative");
    expect(resolved.agentContextBlock).toContain("DMAX Produktlinie");
    expect(resolved.agentContextBlock).toContain("Child initiatives (1):");
    expect(resolved.agentContextBlock).toContain("Prompt Inspector Debug JSON");
    expect(resolved.agentContextBlock).toContain("Definition of Done formulieren");
    expect(resolved.agentContextBlock).toContain("Prompt Experimente");
    expect(resolved.agentContextBlock).toContain("Prompt Review Routine");
    expect(resolved.contextPayload.loadedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "current", entityType: "initiative", id: String(project.id), title: "Prompt Context Phase 1" }),
        expect.objectContaining({ role: "parent", entityType: "category", id: String(category.id), title: "Business" }),
        expect.objectContaining({ role: "parent", entityType: "initiative", id: String(parent.id), title: "DMAX Produktlinie" }),
        expect.objectContaining({ role: "child", entityType: "task", title: "Definition of Done formulieren" })
      ])
    );
    expect(resolved.contextPayload.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "categoryBackground", entityId: String(category.id) }),
        expect.objectContaining({ kind: "initiativeMarkdown", entityId: String(project.id) }),
        expect.objectContaining({ kind: "contextData", id: "context-data-total" })
      ])
    );
  });

  it("documents omitted same-category neighbors when detail caps are reached", () => {
    const category = new CategoryRepository(db).create({ name: "Crowded", description: "Many parallel initiatives." });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({ categoryId: category.id, type: "project", name: "Focused Project" });
    const neighbors = Array.from({ length: 11 }, (_, index) =>
      initiatives.create({ categoryId: category.id, type: "project", name: `Neighbor Project ${index + 1}` })
    );

    const resolved = resolveConversationContext(db, { type: "project", initiativeId: project.id });

    expect(resolved.agentContextBlock).toContain("[3 more omitted by cap]");
    expect(resolved.contextPayload.loadedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "sibling", entityType: "initiative", id: String(neighbors[0]!.id) })
      ])
    );
    expect(resolved.contextPayload.omittedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "sibling", entityType: "initiative", id: String(neighbors[10]!.id), reason: "cap" })
      ])
    );
  });

  it("builds a habit detail context as quality maintenance, not a project with an end date", () => {
    const category = new CategoryRepository(db).create({
      name: "Health",
      description: "# Gewuenschte Qualitaet\n\nStabile Energie durch Pflegehandlungen und realistische Frequenzen."
    });
    const initiatives = new InitiativeRepository(db);
    const habit = initiatives.create({
      categoryId: category.id,
      type: "habit",
      name: "Evening Shutdown",
      markdown: "# Gewohnheit\n\nAbends bewusst herunterfahren."
    });
    initiatives.create({ categoryId: category.id, type: "project", name: "Schlafzimmer optimieren" });
    initiatives.create({ categoryId: category.id, type: "idea", name: "Licht-Ritual testen" });
    new TaskRepository(db).create({ initiativeId: habit.id, title: "Minimalversion fuer muede Abende notieren" });

    const resolved = resolveConversationContext(db, { type: "habit", initiativeId: habit.id });

    expect(resolved.agentContextBlock).toContain("Gewohnheiten-Detail-Modus");
    expect(resolved.agentContextBlock).toContain("gewuenschte Qualitaet");
    expect(resolved.agentContextBlock).toContain("Pflegehandlungen");
    expect(resolved.agentContextBlock).toContain("kein einmaliges Ergebnis");
    expect(resolved.agentContextBlock).toContain("Behandle Habits nicht wie Projekte");
    expect(resolved.agentContextBlock).toContain("Category background");
    expect(resolved.agentContextBlock).toContain("Stabile Energie");
    expect(resolved.agentContextBlock).toContain("Minimalversion fuer muede Abende notieren");
    expect(resolved.agentContextBlock).toContain("Schlafzimmer optimieren");
    expect(resolved.agentContextBlock).toContain("Licht-Ritual testen");
  });

  it("builds a task context with project memory, category background, siblings, and initiative hierarchy", () => {
    const category = new CategoryRepository(db).create({
      name: "Health",
      description: "# Zielbild\n\nGesundheit soll durch klare Outcomes, gute Task-Splits und stabile Routinen getragen werden."
    });
    const initiatives = new InitiativeRepository(db);
    const warmup = initiatives.create({ categoryId: category.id, name: "Warmup", type: "idea" });
    const parent = initiatives.create({ categoryId: category.id, name: "Health System", type: "project" });
    const project = initiatives.create({
      categoryId: category.id,
      parentId: parent.id,
      name: "Health Rhythm",
      startDate: "2026-05-05",
      markdown: "# Overview\n\nEnergy and training rhythm.\n"
    });
    initiatives.create({ categoryId: category.id, parentId: project.id, name: "Training Block", type: "project" });
    const review = initiatives.create({ categoryId: category.id, name: "Review Routine", type: "habit" });
    const relations = new InitiativeRelationRepository(db);
    relations.create({ predecessorInitiativeId: warmup.id, successorInitiativeId: project.id });
    relations.create({ predecessorInitiativeId: project.id, successorInitiativeId: review.id });
    const task = new TaskRepository(db).create({ initiativeId: project.id, title: "Choose weekly training slots" });
    const siblingTask = new TaskRepository(db).create({ initiativeId: project.id, title: "Review current energy baseline" });
    const asset = new MediaAssetRepository(db).create({
      kind: "document",
      mimeType: "application/pdf",
      originalName: "training-plan.pdf",
      storagePath: "assets/cc/hash/training-plan.pdf",
      sha256: "cc123",
      byteSize: 2048,
      summary: "Training plan source document."
    });
    new MediaLinkRepository(db).create({
      assetId: asset.id,
      entityType: "task",
      entityId: task.id,
      caption: "Plan draft"
    });
    const checklistItems = new TaskChecklistItemRepository(db);
    checklistItems.create({ taskId: task.id, name: "Pick gym days" });
    const secondItem = checklistItems.create({ taskId: task.id, name: "Block calendar slots" });
    checklistItems.update({ id: secondItem.id, status: "done" });
    checklistItems.create({ taskId: siblingTask.id, name: "Write down sleep data" });

    const resolved = resolveConversationContext(db, { type: "task", taskId: task.id });

    expect(resolved.contextType).toBe("task");
    expect(resolved.contextEntityId).toBe(task.id);
    expect(resolved.agentContextBlock).toContain("Type: task");
    expect(resolved.agentContextBlock).toContain("Task-Detail-Modus");
    expect(resolved.agentContextBlock).toContain("eindeutiges Outcome");
    expect(resolved.agentContextBlock).toContain("gesplittet");
    expect(resolved.agentContextBlock).toContain("type: project (Project)");
    expect(resolved.agentContextBlock).toContain("time span: starts 2026-05-05");
    expect(resolved.agentContextBlock).toContain("Choose weekly training slots");
    expect(resolved.agentContextBlock).toContain("Checklist (2):");
    expect(resolved.agentContextBlock).toContain("[todo] Pick gym days");
    expect(resolved.agentContextBlock).toContain("[done] Block calendar slots");
    expect(resolved.agentContextBlock).toContain("Media attachments (1):");
    expect(resolved.agentContextBlock).toContain("training-plan.pdf");
    expect(resolved.agentContextBlock).toContain("Plan draft");
    expect(resolved.agentContextBlock).toContain("Training plan source document.");
    expect(resolved.agentContextBlock).toContain("Energy and training rhythm");
    expect(resolved.agentContextBlock).toContain("Category background");
    expect(resolved.agentContextBlock).toContain("klare Outcomes");
    expect(resolved.agentContextBlock).toContain("Parent initiative");
    expect(resolved.agentContextBlock).toContain("Health System");
    expect(resolved.agentContextBlock).toContain("Child initiatives of parent initiative (1):");
    expect(resolved.agentContextBlock).toContain("Training Block");
    expect(resolved.agentContextBlock).toContain("Sibling tasks in same initiative");
    expect(resolved.agentContextBlock).toContain("Review current energy baseline");
    expect(resolved.agentContextBlock).toContain("Write down sleep data");
    expect(resolved.agentContextBlock).toContain("Initiative predecessors (1):");
    expect(resolved.agentContextBlock).toContain("Warmup");
    expect(resolved.agentContextBlock).toContain("Initiative successors (1):");
    expect(resolved.agentContextBlock).toContain("Review Routine");
    expect(resolved.contextPayload.loadedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "current", entityType: "task", id: String(task.id) }),
        expect.objectContaining({ role: "parent", entityType: "initiative", id: String(project.id) }),
        expect.objectContaining({ role: "parent", entityType: "category", id: String(category.id) }),
        expect.objectContaining({ role: "sibling", entityType: "task", id: String(siblingTask.id) })
      ])
    );
    expect(resolved.contextPayload.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "categoryBackground", entityId: String(category.id) }),
        expect.objectContaining({ kind: "initiativeMarkdown", entityId: String(project.id) })
      ])
    );
  });

  it("deduplicates category background in initiatives overview", () => {
    const category = new CategoryRepository(db).create({
      name: "Dedup Area",
      description: "Unique Dedup Markdown should appear once."
    });
    const initiatives = new InitiativeRepository(db);
    initiatives.create({ categoryId: category.id, type: "idea", name: "Dedup Idea" });
    initiatives.create({ categoryId: category.id, type: "project", name: "Dedup Project" });
    initiatives.create({ categoryId: category.id, type: "habit", name: "Dedup Habit" });

    const resolved = resolveConversationContext(db, { type: "initiatives" });

    expect(resolved.promptSections.contextData).toContain("Life area backgrounds");
    expect(resolved.promptSections.contextData).toContain("Initiatives grouped by type and life area");
    expect(countOccurrences(resolved.promptSections.contextData, "Unique Dedup Markdown should appear once.")).toBe(1);
    expect(resolved.contextPayload.deduplications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duplicateOf: `initiatives:category:${category.id}:background`
        })
      ])
    );
  });

  it("summarizes duplicate global tasks in category overview", () => {
    const category = new CategoryRepository(db).create({ name: "Execution", description: "Execution context." });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, type: "project", name: "Execution Project" });
    const task = new TaskRepository(db).create({ initiativeId: initiative.id, title: "Unique task title appears once" });

    const resolved = resolveConversationContext(db, { type: "categories" });

    expect(countOccurrences(resolved.promptSections.contextData, "Unique task title appears once")).toBe(1);
    expect(resolved.promptSections.contextData).toContain("Open execution surface summary");
    expect(resolved.contextPayload.deduplications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceBlock: `categories:global-open-task:${task.id}`,
          duplicateOf: `categories:category-open-task:${category.id}:${task.id}`
        })
      ])
    );
  });

  it("budgets category detail initiative markdown and documents truncation and omissions", () => {
    const category = new CategoryRepository(db).create({
      name: "Large Category",
      description: "Large category description."
    });
    const initiatives = new InitiativeRepository(db);
    const longMarkdown = "# Long\n\n" + "Very long initiative memory. ".repeat(220);
    Array.from({ length: 12 }, (_, index) =>
      initiatives.create({
        categoryId: category.id,
        type: "idea",
        name: `Budget Idea ${index + 1}`,
        markdown: `${longMarkdown}\nMarker ${index + 1}`
      })
    );

    const resolved = resolveConversationContext(db, { type: "category", categoryId: category.id });

    expect(resolved.promptSections.contextData.length).toBeLessThanOrEqual(14500);
    expect(resolved.agentContextBlock).toContain("Budget Idea");
    expect(resolved.contextPayload.budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Initiative context total", maxChars: 8500 })
      ])
    );
    expect(resolved.contextPayload.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "initiativeMarkdown", truncated: true })
      ])
    );
    expect(resolved.contextPayload.omittedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "initiative", reason: "cap" }),
        expect.objectContaining({ entityType: "initiative", reason: "budget" })
      ])
    );
  });

  it("includes life areas without habits in habits list context", () => {
    const category = new CategoryRepository(db).create({
      name: "Quality Without Habit",
      description: "# Zielbild\n\nThis quality needs care but has no habit yet."
    });
    new InitiativeRepository(db).create({ categoryId: category.id, type: "idea", name: "Quality idea" });

    const resolved = resolveConversationContext(db, { type: "habits" });

    expect(resolved.agentContextBlock).toContain("Gewohnheitenlisten-Modus");
    expect(resolved.promptSections.contextData).toContain("Life areas without habits");
    expect(resolved.promptSections.contextData).toContain("Quality Without Habit");
    expect(resolved.contextPayload.loadedEntities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "related", entityType: "category", id: String(category.id), kind: "without_habit" })
      ])
    );
  });

  it("includes people and organization participants in focused contexts", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "Relationship System" });
    const task = new TaskRepository(db).create({ initiativeId: initiative.id, title: "Call Clara" });
    const person = new PersonRepository(db).create({ firstName: "Clara", lastName: "Kontakt", salutation: "mrs", description: "Clara koordiniert den Beziehungsaufbau." });
    const organization = new OrganizationRepository(db).create({ name: "Acme GmbH", markdown: "Strategic partner notes." });
    new PartyContactPointRepository(db).create({ partyId: person.id, type: "email", value: "clara@example.com", isPreferred: true });
    new PartyAddressRepository(db).create({ partyId: organization.id, line1: "Main Street 1", city: "Hamburg" });
    const participants = new EntityParticipantRepository(db);
    participants.create({ partyId: person.id, entityType: "initiative", entityId: initiative.id, roleLabel: "Stakeholder", isPrimary: true });
    participants.create({ partyId: person.id, entityType: "task", entityId: task.id, roleLabel: "Ansprechpartner" });

    const projectContext = resolveConversationContext(db, { type: "project", initiativeId: initiative.id });
    const taskContext = resolveConversationContext(db, { type: "task", taskId: task.id });
    const personContext = resolveConversationContext(db, { type: "person", partyId: person.id });
    const organizationContext = resolveConversationContext(db, { type: "organization", partyId: organization.id });
    const peopleContext = resolveConversationContext(db, { type: "people" });

    expect(projectContext.agentContextBlock).toContain("People and organizations (1):");
    expect(projectContext.agentContextBlock).toContain("Clara Kontakt");
    expect(taskContext.agentContextBlock).toContain("Ansprechpartner");
    expect(personContext.agentContextBlock).toContain("Person: #");
    expect(personContext.agentContextBlock).toContain("Clara koordiniert den Beziehungsaufbau.");
    expect(personContext.agentContextBlock).toContain("Contact points (1):");
    expect(personContext.agentContextBlock).toContain("clara@example.com");
    expect(personContext.agentContextBlock).toContain("DMAX participations (2):");
    expect(organizationContext.agentContextBlock).toContain("Strategic partner notes.");
    expect(organizationContext.agentContextBlock).toContain("Postal addresses (1):");
    expect(organizationContext.agentContextBlock).toContain("Main Street 1");
    expect(peopleContext.contextType).toBe("people");
    expect(peopleContext.agentContextBlock).toContain("preferred contact: email clara@example.com");
  });

  it("includes complete local Gmail, manual communication, and all relevant party tasks for a person", () => {
    const person = new PersonRepository(db).create({
      firstName: "Info",
      lastName: "Abend",
      description: "Kontakt fuer Veranstaltungsanmeldungen."
    });
    new PartyContactPointRepository(db).create({ partyId: person.id, type: "email", value: "infoabend@example.com", isPreferred: true });
    const tasks = new TaskRepository(db);
    const openTask = tasks.create({
      primaryPartyId: person.id,
      title: "Nächsten Infoabend prüfen und anmelden",
      notes: "Prüfen, ob Anmeldung noch offen ist."
    });
    const doneTask = tasks.complete(tasks.create({
      primaryPartyId: person.id,
      title: "Alte Unterlagen prüfen",
      notes: "Erledigte Maßnahme darf im Kontext nicht verschwinden."
    }).id, "2026-06-20T09:00:00.000Z");

    new PartyTimelineRepository(db).create({
      partyId: person.id,
      kind: "conversation",
      channel: "phone",
      occurredAt: "2026-01-05T09:00:00.000Z",
      title: "Telefonische Vorabklaerung",
      body: "Alter Hinweis: Teilnahme ist grundsätzlich möglich."
    });

    const gmail = new GmailRepository(db);
    const mailbox = gmail.upsertMailbox({ accountLabel: "dietrich@example.com" });
    const matches = gmail.matchesForEmails(["infoabend@example.com"]);
    gmail.upsertMessage({
      mailboxId: mailbox.id,
      gmailMessageId: "old-infoabend",
      gmailThreadId: "thread-infoabend",
      historyId: null,
      labelIds: ["INBOX"],
      direction: "inbound",
      messageDate: "2026-01-10T10:00:00.000Z",
      subject: "Infoabend Details",
      from: [{ name: "Infoabend Team", email: "infoabend@example.com" }],
      to: [{ name: "Dietrich", email: "dietrich@example.com" }],
      cc: [],
      bcc: [],
      plainBody: "Vollständiger alter Mailinhalt mit entscheidender Zusage: ALTE_ZUSAGE_INFOABEND.",
      htmlBody: null,
      snippet: "Alter Snippet",
      attachments: []
    }, matches);
    gmail.upsertMessage({
      mailboxId: mailbox.id,
      gmailMessageId: "new-infoabend",
      gmailThreadId: "thread-infoabend",
      historyId: null,
      labelIds: ["SENT"],
      direction: "outbound",
      messageDate: "2026-06-28T10:00:00.000Z",
      subject: "Anmeldung Infoabend",
      from: [{ name: "Dietrich", email: "dietrich@example.com" }],
      to: [{ name: "Infoabend Team", email: "infoabend@example.com" }],
      cc: [],
      bcc: [],
      plainBody: "Ich habe mich zum Infoabend angemeldet. Vollständige neue Mail bestaetigt die Anmeldung.",
      htmlBody: null,
      snippet: "Neue Anmeldung",
      attachments: []
    }, matches);

    const resolved = resolveConversationContext(db, { type: "person", partyId: person.id });

    expect(resolved.agentContextBlock).toContain("Complete local communication history (3, newest first; Gmail 2, manual 1):");
    expect(resolved.agentContextBlock).toContain("ALTE_ZUSAGE_INFOABEND");
    expect(resolved.agentContextBlock).toContain("Ich habe mich zum Infoabend angemeldet.");
    expect(resolved.agentContextBlock.indexOf("new-infoabend")).toBeLessThan(resolved.agentContextBlock.indexOf("old-infoabend"));
    expect(resolved.agentContextBlock).toContain(openTask.title);
    expect(resolved.agentContextBlock).toContain(doneTask.title);
    expect(resolved.contextPayload.limits).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Critical party context is not count-capped")
      ])
    );
    expect(resolved.contextPayload.omittedEntities).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "task" }),
        expect.objectContaining({ entityType: "communication" })
      ])
    );
  });

  it("rolls active organization people and their local communication into organization agent context", () => {
    const organizations = new OrganizationRepository(db);
    const people = new PersonRepository(db);
    const relationships = new PartyRelationshipRepository(db);
    const relationshipTypes = new RelationshipTypeRepository(db);
    const contacts = new PartyContactPointRepository(db);
    const tasks = new TaskRepository(db);

    const category = new CategoryRepository(db).create({ name: "CRM" });
    const initiative = new InitiativeRepository(db).create({
      categoryId: category.id,
      name: "Schulkooperation",
      markdown: "# Ziel\n\nKooperation mit der Organisation aufbauen."
    });
    const organization = organizations.create({ name: "Bildungshaus GmbH", markdown: "Organisation fuer lokale Bildungsangebote." });
    const employee = people.create({
      firstName: "Bianka",
      lastName: "Kontakt",
      salutation: "mrs",
      description: "Bianka koordiniert Infoabende und Anmeldungen."
    });
    contacts.create({ partyId: employee.id, type: "email", value: "bianka@example.com" });
    const worksFor = relationshipTypes.findByKey("works_for") ?? relationshipTypes.list()[0]!;
    relationships.create({
      fromPartyId: employee.id,
      toPartyId: organization.id,
      relationshipTypeId: worksFor.id,
      roleLabel: "Infoabend-Koordination",
      status: "active"
    });
    new EntityParticipantRepository(db).create({
      partyId: employee.id,
      entityType: "initiative",
      entityId: initiative.id,
      roleLabel: "Ansprechpartnerin"
    });
    tasks.create({
      primaryPartyId: organization.id,
      initiativeId: initiative.id,
      title: "Nächsten Infoabend prüfen und anmelden"
    });

    const gmail = new GmailRepository(db);
    const mailbox = gmail.upsertMailbox({ accountLabel: "dietrich@example.com" });
    gmail.upsertMessage({
      mailboxId: mailbox.id,
      gmailMessageId: "employee-only-message",
      gmailThreadId: null,
      historyId: null,
      labelIds: ["INBOX"],
      direction: "inbound",
      messageDate: "2026-06-29T10:00:00.000Z",
      subject: "Bestätigung Infoabend",
      from: [{ name: "Bianka Kontakt", email: "bianka@example.com" }],
      to: [{ name: "Dietrich", email: "dietrich@example.com" }],
      cc: [],
      bcc: [],
      plainBody: "Ihre Anmeldung zum Infoabend ist bestätigt. Diese Mail ist nur mit der Person verknüpft.",
      htmlBody: null,
      snippet: "Anmeldung bestätigt",
      attachments: []
    }, gmail.matchesForEmails(["bianka@example.com"]));

    const resolved = resolveConversationContext(db, { type: "organization", partyId: organization.id });

    expect(resolved.agentContextBlock).toContain("Organization people (1, complete active related people):");
    expect(resolved.agentContextBlock).toContain("Bianka koordiniert Infoabende");
    expect(resolved.agentContextBlock).toContain("Infoabend-Koordination");
    expect(resolved.agentContextBlock).toContain("salutation/gender signal: mrs");
    expect(resolved.agentContextBlock).toContain("employee-only-message");
    expect(resolved.agentContextBlock).toContain("Ihre Anmeldung zum Infoabend ist bestätigt.");
    expect(resolved.agentContextBlock).toContain("Kooperation mit der Organisation aufbauen.");
    expect(resolved.agentContextBlock).toContain("Ansprechpartnerin");
    expect(resolved.contextPayload.children).toEqual(
      expect.arrayContaining([
        "1 active organization people",
        "1 complete local Gmail messages"
      ])
    );
  });

  it("lists prompt templates for navigation contexts", () => {
    const templates = listPromptTemplates();

    expect(templates.map((template) => template.name)).toEqual([
      "Global",
      "Categories List View",
      "Category Detail View",
      "Initiatives Overview",
      "Ideen List View",
      "Ideen Detail View",
      "Projekte List View",
      "Projekte Detail View",
      "Gewohnheiten List View",
      "Gewohnheiten Detail View",
      "Tasks List View",
      "Tasks Detail View"
    ]);
    expect(templates[0]?.finalPromptTemplate).toContain("User message:");
    expect(templates.find((template) => template.id === "categories-list")?.route).toBe("/categories");
    expect(templates.find((template) => template.id === "categories-list")?.displayContext).toBe("categories");
    expect(templates.find((template) => template.id === "categories-list")?.effectiveContext).toBe("categories");
    expect(templates.find((template) => template.id === "initiatives-overview")?.effectiveContext).toBe("initiatives");
    expect(templates.find((template) => template.id === "initiatives-overview")?.systemInstructions).toContain("Initiativen-Overview-Modus");
    expect(templates.find((template) => template.id === "ideas-list")?.effectiveContext).toBe("ideas");
    expect(templates.find((template) => template.id === "ideas-detail")?.effectiveContext).toBe("idea");
    expect(templates.find((template) => template.id === "projects-list")?.effectiveContext).toBe("projects");
    expect(templates.find((template) => template.id === "projects-detail")?.effectiveContext).toBe("project");
    expect(templates.find((template) => template.id === "habits-list")?.effectiveContext).toBe("habits");
    expect(templates.find((template) => template.id === "habits-detail")?.effectiveContext).toBe("habit");
    expect(templates.find((template) => template.id === "tasks-list")?.effectiveContext).toBe("tasks");
    expect(templates.find((template) => template.id === "tasks-detail")?.contextDataTemplate).toContain("Checklist");
    expect(templates.find((template) => template.id === "tasks-detail")?.contextDataTemplate).toContain("Media attachments");
    expect(templates.find((template) => template.id === "tasks-detail")?.contextDataTemplate).toContain("Initiative predecessors");
    expect(templates.find((template) => template.id === "ideas-detail")?.contextDataTemplate).toContain("Predecessors");
    expect(templates.find((template) => template.id === "projects-detail")?.contextDataTemplate).toContain("Media attachments");
    expect(templates.find((template) => template.id === "projects-detail")?.contextDataTemplate).toContain("Predecessors");
    expect(templates.find((template) => template.id === "category-detail")?.route).toBe("/categories/:categoryName");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).not.toContain("Color: {{category_color}}");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).toContain("Ideen in diesem Lebensbereich");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).toContain("{{idea_markdown}}");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).toContain("Projekte in diesem Lebensbereich");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).toContain("{{project_markdown}}");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).toContain("Gewohnheiten in diesem Lebensbereich");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).toContain("{{habit_markdown}}");
    expect(templates.find((template) => template.id === "category-detail")?.contextDataTemplate).not.toContain("{{initiative_summary_or_memory}}");
    expect(templates.find((template) => template.id === "category-detail")?.systemInstructions).toContain("Regeln fuer Lebensbereich-/Category-Beschreibungen");
    expect(templates.find((template) => template.id === "category-detail")?.systemInstructions).toContain("Category-Detail-Facilitation-Modus");
    expect(templates.find((template) => template.id === "category-detail")?.systemInstructions).toContain("Gewohnheiten: bestehende und sinnvolle moegliche Gewohnheiten");
    expect(templates.find((template) => template.id === "category-detail")?.systemInstructions).toContain("Projekte: laufende, geplante und denkbare Projekte");
    expect(templates.find((template) => template.id === "category-detail")?.systemInstructions).not.toContain("Context contract:");
    expect(templates.find((template) => template.id === "categories-list")?.systemInstructions).not.toContain("Category-Detail-Facilitation-Modus");
  });
});

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
