import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CalendarEntryRepository } from "../../src/repositories/calendar-entries.js";
import { CalendarEventBindingRepository } from "../../src/repositories/calendar-event-bindings.js";
import { CalendarEventVisibilityRepository } from "../../src/repositories/calendar-event-visibility.js";
import { CalendarSourceRepository } from "../../src/repositories/calendar-sources.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRelationRepository } from "../../src/repositories/initiative-relations.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { MediaAssetRepository } from "../../src/repositories/media-assets.js";
import { MediaLinkRepository } from "../../src/repositories/media-links.js";
import { PlanningCanvasRepository } from "../../src/repositories/planning-canvas.js";
import { TaskChecklistItemRepository } from "../../src/repositories/task-checklist-items.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("repositories", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates categories, initiatives, and tasks", () => {
    const categories = new CategoryRepository(db);
    const initiatives = new InitiativeRepository(db);
    const tasks = new TaskRepository(db);

    const category = categories.create({ name: "Business" });
    const project = initiatives.create({
      categoryId: category.id,
      name: "d-max",
      markdown: "# Overview\n\nBuild d-max.\n",
      startDate: "2026-05-02",
      endDate: "2026-06-15"
    });
    const task = tasks.create({
      initiativeId: project.id,
      title: "Implement repositories",
      priority: "high"
    });

    expect(categories.list()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Inbox", isSystem: true })]));
    expect(category.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(category.emoji).toBe("💼");
    expect(initiatives.list({ categoryId: category.id })).toHaveLength(1);
    expect(project.type).toBe("project");
    expect(project.startDate).toBe("2026-05-02");
    expect(project.endDate).toBe("2026-06-15");
    expect(project.isLocked).toBe(false);
    expect(task.priority).toBe("high");
    expect(tasks.list({ initiativeId: project.id })).toHaveLength(1);
  });

  it("updates initiative date ranges and lock status", () => {
    const category = new CategoryRepository(db).create({ name: "Reisen" });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({ categoryId: category.id, name: "Portugal Trip", startDate: "2026-07-01" });

    const updated = initiatives.update({ id: project.id, endDate: "2026-07-21", isLocked: true });

    expect(updated.startDate).toBe("2026-07-01");
    expect(updated.endDate).toBe("2026-07-21");
    expect(updated.isLocked).toBe(true);
  });

  it("rejects initiative date ranges where start is after end", () => {
    const category = new CategoryRepository(db).create({ name: "Reisen" });
    const initiatives = new InitiativeRepository(db);

    expect(() =>
      initiatives.create({ categoryId: category.id, name: "Invalid Trip", startDate: "2026-08-10", endDate: "2026-08-01" })
    ).toThrow("startDate cannot be after endDate");
  });

  it("creates and filters initiative types", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiatives = new InitiativeRepository(db);

    const idea = initiatives.create({ categoryId: category.id, name: "New offer angle", type: "idea" });
    const habit = initiatives.create({ categoryId: category.id, name: "Maintain customer relationships", type: "habit" });

    expect(idea.type).toBe("idea");
    expect(habit.type).toBe("habit");
    expect(initiatives.list({ type: "idea" }).map((project) => project.id)).toContain(idea.id);
    expect(initiatives.list({ type: "habit" }).map((project) => project.id)).toContain(habit.id);
  });

  it("manages directed initiative predecessor and successor relations without cycles", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiatives = new InitiativeRepository(db);
    const relations = new InitiativeRelationRepository(db);
    const first = initiatives.create({ categoryId: category.id, name: "A", type: "idea" });
    const second = initiatives.create({ categoryId: category.id, name: "B", type: "project" });
    const third = initiatives.create({ categoryId: category.id, name: "C", type: "habit" });

    const firstToSecond = relations.create({ predecessorInitiativeId: first.id, successorInitiativeId: second.id });
    const duplicate = relations.create({ predecessorInitiativeId: first.id, successorInitiativeId: second.id });
    relations.create({ predecessorInitiativeId: second.id, successorInitiativeId: third.id });

    expect(duplicate.id).toBe(firstToSecond.id);
    expect(relations.getInitiativePredecessors(second.id).map((relation) => relation.predecessor.name)).toEqual(["A"]);
    expect(relations.getInitiativeSuccessors(second.id).map((relation) => relation.successor.name)).toEqual(["C"]);
    expect(relations.getInitiativeGraph({ initiativeId: second.id, maxDepth: 2 }).initiatives.map((initiative) => initiative.name).sort()).toEqual(["A", "B", "C"]);
    expect(() => relations.create({ predecessorInitiativeId: third.id, successorInitiativeId: first.id })).toThrow("cycle");
    expect(() => relations.create({ predecessorInitiativeId: first.id, successorInitiativeId: first.id })).toThrow("itself");

    expect(relations.delete(firstToSecond.id)).toMatchObject({ id: firstToSecond.id });
    expect(relations.getInitiativePredecessors(second.id)).toEqual([]);
  });

  it("places initiatives on the default planning canvas and exposes visible relation edges", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiatives = new InitiativeRepository(db);
    const relations = new InitiativeRelationRepository(db);
    const tasks = new TaskRepository(db);
    const canvas = new PlanningCanvasRepository(db);
    const parent = initiatives.create({ categoryId: category.id, name: "Parent", type: "project", startDate: "2026-05-01", endDate: "2026-05-03" });
    const child = initiatives.create({ categoryId: category.id, parentId: parent.id, name: "Child", type: "project" });
    const successor = initiatives.create({ categoryId: category.id, name: "Successor", type: "project" });
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google",
      readOnly: false
    });
    new CalendarEventBindingRepository(db).create({
      localEntityType: "initiative_project_span",
      localEntityId: parent.id,
      calendarSourceId: source.id,
      externalCalendarId: source.calendarId,
      externalEventId: "google-event-1"
    });
    tasks.create({ initiativeId: parent.id, title: "Parent task" });
    relations.create({ predecessorInitiativeId: child.id, successorInitiativeId: successor.id });

    const firstNode = canvas.createNode({ initiativeId: parent.id, x: 10, y: 20 });
    canvas.createNode({ initiativeId: child.id, x: 320, y: 120 });
    canvas.createNode({ initiativeId: successor.id, x: 620, y: 220 });
    const moved = canvas.updateNode({ id: firstNode.id, x: 40, y: 60 });
    const view = canvas.getView();

    expect(moved.x).toBe(40);
    expect(view.canvas.name).toBe("Default");
    expect(view.nodes.map((node) => node.initiative.name)).toEqual(["Parent", "Child", "Successor"]);
    expect(view.nodes.find((node) => node.initiativeId === parent.id)?.openTaskCount).toBe(1);
    expect(view.nodes.find((node) => node.initiativeId === parent.id)?.hasGoogleCalendarBinding).toBe(true);
    expect(view.nodes.find((node) => node.initiativeId === child.id)?.hasGoogleCalendarBinding).toBe(false);
    expect(view.relationEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "parent_child", fromInitiativeId: parent.id, toInitiativeId: child.id }),
        expect.objectContaining({ kind: "precedes", fromInitiativeId: child.id, toInitiativeId: successor.id })
      ])
    );
    expect(view.unmappedInitiatives.map((entry) => entry.initiative.id)).not.toContain(parent.id);
  });

  it("filters only the planning canvas parking lot, not already placed nodes", () => {
    const business = new CategoryRepository(db).create({ name: "Business" });
    const family = new CategoryRepository(db).create({ name: "Familie" });
    const initiatives = new InitiativeRepository(db);
    const canvas = new PlanningCanvasRepository(db);
    const businessProject = initiatives.create({ categoryId: business.id, name: "Business project", type: "project" });
    const familyProject = initiatives.create({ categoryId: family.id, name: "Family project", type: "project" });
    const familyIdea = initiatives.create({ categoryId: family.id, name: "Family idea", type: "idea" });
    const unplacedFamilyProject = initiatives.create({ categoryId: family.id, name: "Unplaced family project", type: "project" });

    canvas.createNode({ initiativeId: businessProject.id, x: 10, y: 20 });
    canvas.createNode({ initiativeId: familyProject.id, x: 320, y: 20 });
    const view = canvas.getView({ filters: { categoryId: family.id, type: "idea" } });

    expect(view.nodes.map((node) => node.initiative.id).sort()).toEqual([businessProject.id, familyProject.id].sort());
    expect(view.unmappedInitiatives.map((entry) => entry.initiative.id)).toEqual([unplacedFamilyProject.id]);
    expect(view.unmappedInitiatives.map((entry) => entry.initiative.id)).not.toContain(familyIdea.id);
  });

  it("keeps Inbox as a system category", () => {
    const categories = new CategoryRepository(db);
    const inbox = categories.findByName("Inbox");

    expect(inbox).toMatchObject({ name: "Inbox", isSystem: true });
    expect(inbox?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(inbox?.emoji).toBe("📥");
  });

  it("supports explicit category colors", () => {
    const categories = new CategoryRepository(db);

    const category = categories.create({ name: "Health", color: "#4ab7b0" });
    const updated = categories.update({ id: category.id, color: "#8a64c9" });

    expect(category.color).toBe("#4ab7b0");
    expect(updated.color).toBe("#8a64c9");
  });

  it("updates category markdown descriptions", () => {
    const categories = new CategoryRepository(db);
    const category = categories.create({ name: "Health" });

    const updated = categories.update({
      id: category.id,
      description: "# Scope\n\nTraining, recovery, and energy.\n\n# Zielbild\n\nStable baseline."
    });
    const cleared = categories.update({ id: category.id, description: "" });

    expect(updated.description).toContain("# Scope");
    expect(cleared.description).toBe("");
  });

  it("marks tasks complete with completedAt", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const project = new InitiativeRepository(db).create({ categoryId: category.id, name: "d-max" });
    const tasks = new TaskRepository(db);
    const task = tasks.create({ initiativeId: project.id, title: "Ship MVP" });

    const completed = tasks.complete(task.id, "2026-04-28T10:00:00.000Z");

    expect(completed.status).toBe("done");
    expect(completed.completedAt).toBe("2026-04-28T10:00:00.000Z");
  });

  it("manages task checklist items without completing the parent task", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const project = new InitiativeRepository(db).create({ categoryId: category.id, name: "d-max" });
    const tasks = new TaskRepository(db);
    const task = tasks.create({ initiativeId: project.id, title: "Ship checklist MVP" });
    const checklistItems = new TaskChecklistItemRepository(db);
    const mediaAssets = new MediaAssetRepository(db);
    const mediaLinks = new MediaLinkRepository(db);

    const first = checklistItems.create({ taskId: task.id, name: "Create schema" });
    const second = checklistItems.create({ taskId: task.id, name: "Build UI" });
    const asset = mediaAssets.create({
      kind: "image",
      mimeType: "image/png",
      originalName: "task-media.png",
      storagePath: "assets/task-media.png",
      sha256: "task-media-hash",
      byteSize: 42
    });
    mediaLinks.create({ assetId: asset.id, entityType: "task", entityId: task.id });
    const completedItem = checklistItems.update({ id: first.id, status: "done" });
    checklistItems.reorderWithinTask(task.id, [second.id, first.id]);

    expect(completedItem.status).toBe("done");
    expect(tasks.findById(task.id)?.status).toBe("open");
    expect(checklistItems.listByTask(task.id).map((item) => item.id)).toEqual([second.id, first.id]);

    tasks.delete(task.id);
    expect(checklistItems.listByTask(task.id)).toEqual([]);
    expect(mediaLinks.listForEntity("task", task.id)).toEqual([]);
  });

  it("persists manual ordering for categories, initiatives, and tasks", () => {
    const categories = new CategoryRepository(db);
    const initiatives = new InitiativeRepository(db);
    const tasks = new TaskRepository(db);

    const firstCategory = categories.create({ name: "Business" });
    const secondCategory = categories.create({ name: "Reisen" });
    categories.reorder([secondCategory.id, firstCategory.id]);

    const firstProject = initiatives.create({ categoryId: secondCategory.id, name: "A" });
    const secondProject = initiatives.create({ categoryId: secondCategory.id, name: "B" });
    initiatives.reorderWithinCategory(secondCategory.id, [secondProject.id, firstProject.id]);

    const firstTask = tasks.create({ initiativeId: secondProject.id, title: "First" });
    const secondTask = tasks.create({ initiativeId: secondProject.id, title: "Second" });
    tasks.reorderWithinInitiative(secondProject.id, [secondTask.id, firstTask.id]);

    expect(categories.list().filter((category) => category.name !== "Inbox").map((category) => category.id)).toEqual([
      secondCategory.id,
      firstCategory.id
    ]);
    expect(initiatives.list({ categoryId: secondCategory.id }).map((project) => project.id)).toEqual([secondProject.id, firstProject.id]);
    expect(tasks.list({ initiativeId: secondProject.id }).map((task) => task.id)).toEqual([secondTask.id, firstTask.id]);
  });

  it("creates calendar entries and completes linked tasks", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "d-max" });
    const task = new TaskRepository(db).create({ initiativeId: initiative.id, title: "Plan calendar MVP" });
    const calendarEntries = new CalendarEntryRepository(db);

    const entry = calendarEntries.create({
      type: "task_work",
      title: task.title,
      startAt: "2026-05-04T09:00:00.000",
      endAt: "2026-05-04T10:30:00.000",
      taskId: task.id
    });
    const completed = calendarEntries.complete(entry.id, "2026-05-04T10:31:00.000Z");

    expect(completed.status).toBe("done");
    expect(new TaskRepository(db).findById(task.id)).toMatchObject({
      status: "done",
      completedAt: "2026-05-04T10:31:00.000Z"
    });
  });

  it("stores calendar source configuration without credentials", () => {
    const sources = new CalendarSourceRepository(db);

    const source = sources.create({
      accountLabel: "dw@b42.io",
      calendarId: "primary",
      displayName: "Business",
      color: "#27806f"
    });
    const disabled = sources.update({ id: source.id, enabled: false });

    expect(disabled).toMatchObject({
      provider: "google",
      accountLabel: "dw@b42.io",
      calendarId: "primary",
      displayName: "Business",
      enabled: false,
      readOnly: true
    });
  });

  it("stores one active Google binding per concrete DMAX time object", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "d-max" });
    const entry = new CalendarEntryRepository(db).create({
      type: "initiative_focus",
      title: "Focus block",
      startAt: "2026-05-04T09:00:00.000",
      endAt: "2026-05-04T10:30:00.000",
      initiativeId: initiative.id
    });
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@b42.io",
      calendarId: "primary",
      displayName: "Business"
    });
    const bindings = new CalendarEventBindingRepository(db);

    const binding = bindings.create({
      localEntityType: "calendar_entry",
      localEntityId: entry.id,
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      externalEtag: "etag-1",
      externalUpdatedAt: "2026-05-04T08:00:00.000Z"
    });

    expect(bindings.findActiveByLocal({ localEntityType: "calendar_entry", localEntityId: entry.id })).toMatchObject({
      id: binding.id,
      syncStatus: "synced",
      externalEventId: "google-event-1"
    });
    expect(() =>
      bindings.create({
        localEntityType: "calendar_entry",
        localEntityId: entry.id,
        calendarSourceId: source.id,
        externalCalendarId: "primary",
        externalEventId: "google-event-2"
      })
    ).toThrow();

    bindings.unlink(binding.id, "2026-05-04T11:00:00.000Z");
    expect(() =>
      bindings.create({
        localEntityType: "calendar_entry",
        localEntityId: entry.id,
        calendarSourceId: source.id,
        externalCalendarId: "primary",
        externalEventId: "google-event-2"
      })
    ).not.toThrow();
  });

  it("stores hidden Google event visibility rules for canvas and recurring series", () => {
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@b42.io",
      calendarId: "primary",
      displayName: "Business"
    });
    const visibility = new CalendarEventVisibilityRepository(db);

    const instance = visibility.create({
      surface: "planning_canvas",
      hiddenScope: "recurring_instance",
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "instance-1",
      recurringEventId: "series-1",
      originalStartAt: "2026-06-02",
      titleSnapshot: "Recurring class",
      startAtSnapshot: "2026-06-02",
      endAtSnapshot: "2026-06-02"
    });
    const updated = visibility.create({
      surface: "planning_canvas",
      hiddenScope: "recurring_instance",
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "instance-1-renamed",
      recurringEventId: "series-1",
      originalStartAt: "2026-06-02",
      titleSnapshot: "Recurring class renamed"
    });
    const series = visibility.create({
      surface: "planning_canvas",
      hiddenScope: "recurring_series",
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      recurringEventId: "series-1",
      titleSnapshot: "Recurring class"
    });

    expect(updated.id).toBe(instance.id);
    expect(visibility.list({ surfaces: ["planning_canvas"] })).toHaveLength(2);
    expect(visibility.matchesEvent({
      id: "instance-2",
      externalCalendarId: "primary",
      externalEventId: "instance-2",
      title: "Recurring class",
      startAt: "2026-06-09",
      endAt: "2026-06-09",
      allDay: true,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: null,
      etag: null,
      updatedAt: null,
      recurring: true,
      recurringEventId: "series-1",
      originalStartAt: "2026-06-09",
      organizerSelf: true,
      sourceReadOnly: true,
      editable: false,
      readOnlyReason: "recurring_not_supported",
      color: null,
      readOnly: true
    }, series)).toBe(true);
  });
});
