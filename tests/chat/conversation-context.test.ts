import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { listPromptTemplates, resolveConversationContext } from "../../src/chat/conversation-context.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
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
      name: "d-max",
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
    expect(resolved.agentContextBlock).toContain(
      "Bedeutung: Fokussiert auf einen Lebensbereich, seine Markdown-Beschreibung und zugehoerigen Ideen, Projekten und Gewohnheiten (Initiativen)."
    );
    expect(resolved.agentContextBlock).toContain("Business");
    expect(resolved.agentContextBlock).toContain("Ideen in diesem Lebensbereich (1):");
    expect(resolved.agentContextBlock).toContain("Agent Prompt Idee");
    expect(resolved.agentContextBlock).toContain("Mehr Kontextklarheit fuer den Agenten.");
    expect(resolved.agentContextBlock).toContain("Projekte in diesem Lebensbereich (1):");
    expect(resolved.agentContextBlock).toContain("d-max");
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

  it("keeps category facilitation instructions out of broad initiatives context", () => {
    new CategoryRepository(db).create({ name: "Business" });

    const resolved = resolveConversationContext(db, { type: "categories" });

    expect(resolved.contextType).toBe("categories");
    expect(resolved.agentContextBlock).toContain("Type: categories");
    expect(resolved.agentContextBlock).not.toContain("Category-Detail-Facilitation-Modus");
  });

  it("builds type-specific collection contexts for ideas, projects, habits, and tasks", () => {
    const category = new CategoryRepository(db).create({ name: "Travel" });
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
    expect(ideas.agentContextBlock).toContain("Neuseeland-Route");
    expect(ideas.agentContextBlock).not.toContain("Reiserad kaufen");
    expect(projects.contextType).toBe("projects");
    expect(projects.agentContextBlock).toContain("Reiserad kaufen");
    expect(habits.contextType).toBe("habits");
    expect(habits.agentContextBlock).toContain("Wochenreview");
    expect(taskList.contextType).toBe("tasks");
    expect(taskList.agentContextBlock).toContain("Open tasks across d-max");
    expect(taskList.agentContextBlock).toContain("Haendler anrufen");
  });

  it("builds a task context with project memory", () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new InitiativeRepository(db).create({
      categoryId: category.id,
      name: "Health Rhythm",
      startDate: "2026-05-05",
      markdown: "# Overview\n\nEnergy and training rhythm.\n"
    });
    const task = new TaskRepository(db).create({ initiativeId: project.id, title: "Choose weekly training slots" });

    const resolved = resolveConversationContext(db, { type: "task", taskId: task.id });

    expect(resolved.contextType).toBe("task");
    expect(resolved.contextEntityId).toBe(task.id);
    expect(resolved.agentContextBlock).toContain("Type: task");
    expect(resolved.agentContextBlock).toContain("type: project (Project)");
    expect(resolved.agentContextBlock).toContain("time span: starts 2026-05-05");
    expect(resolved.agentContextBlock).toContain("Choose weekly training slots");
    expect(resolved.agentContextBlock).toContain("Energy and training rhythm");
  });

  it("lists prompt templates for navigation contexts", () => {
    const templates = listPromptTemplates();

    expect(templates.map((template) => template.name)).toEqual([
      "Global",
      "Categories List View",
      "Category Detail View",
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
    expect(templates.find((template) => template.id === "ideas-list")?.effectiveContext).toBe("ideas");
    expect(templates.find((template) => template.id === "ideas-detail")?.effectiveContext).toBe("idea");
    expect(templates.find((template) => template.id === "projects-list")?.effectiveContext).toBe("projects");
    expect(templates.find((template) => template.id === "projects-detail")?.effectiveContext).toBe("project");
    expect(templates.find((template) => template.id === "habits-list")?.effectiveContext).toBe("habits");
    expect(templates.find((template) => template.id === "habits-detail")?.effectiveContext).toBe("habit");
    expect(templates.find((template) => template.id === "tasks-list")?.effectiveContext).toBe("tasks");
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
