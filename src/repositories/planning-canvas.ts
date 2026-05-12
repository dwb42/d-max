import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { Category } from "./categories.js";
import type { Initiative, InitiativeStatus, InitiativeType, ProjectPhase } from "./initiatives.js";
import type { Task } from "./tasks.js";

export type PlanningCanvasZoom = "month" | "week";

export type PlanningCanvas = {
  id: number;
  name: string;
  description: string | null;
  defaultStartDate: string | null;
  defaultZoom: PlanningCanvasZoom;
  createdAt: string;
  updatedAt: string;
};

export type PlanningCanvasNode = {
  id: number;
  canvasId: number;
  initiativeId: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlanningCanvasInitiativeNode = PlanningCanvasNode & {
  initiative: Initiative;
  category: Pick<Category, "id" | "name" | "color"> | null;
  tasks: Task[];
  taskCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  hasGoogleCalendarBinding: boolean;
};

export type PlanningCanvasRelationEdge = {
  kind: "parent_child" | "precedes";
  fromInitiativeId: number;
  toInitiativeId: number;
  relationId: number | null;
};

export type PlanningCanvasViewFilters = {
  search?: string;
  categoryId?: number;
  type?: InitiativeType;
  status?: InitiativeStatus;
  includeArchived?: boolean;
};

export type PlanningCanvasView = {
  canvas: PlanningCanvas;
  nodes: PlanningCanvasInitiativeNode[];
  unmappedInitiatives: Array<{
    initiative: Initiative;
    category: Pick<Category, "id" | "name" | "color"> | null;
    taskCount: number;
    openTaskCount: number;
  }>;
  relationEdges: PlanningCanvasRelationEdge[];
};

type PlanningCanvasRow = {
  id: number;
  name: string;
  description: string | null;
  default_start_date: string | null;
  default_zoom: PlanningCanvasZoom;
  created_at: string;
  updated_at: string;
};

type PlanningCanvasNodeRow = {
  id: number;
  canvas_id: number;
  initiative_id: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: number;
  created_at: string;
  updated_at: string;
};

type InitiativeCanvasRow = PlanningCanvasNodeRow & {
  initiative_id_join: number;
  category_id: number;
  parent_id: number | null;
  type: InitiativeType;
  project_phase: ProjectPhase;
  name: string;
  status: InitiativeStatus;
  summary: string | null;
  markdown: string;
  start_date: string | null;
  end_date: string | null;
  is_locked: number;
  sort_order: number;
  is_system: number;
  initiative_created_at: string;
  initiative_updated_at: string;
  category_name: string | null;
  category_color: string | null;
  task_count: number;
  open_task_count: number;
  done_task_count: number;
  has_google_calendar_binding: number;
};

type UnmappedInitiativeRow = {
  id: number;
  category_id: number;
  parent_id: number | null;
  type: InitiativeType;
  project_phase: ProjectPhase;
  name: string;
  status: InitiativeStatus;
  summary: string | null;
  markdown: string;
  start_date: string | null;
  end_date: string | null;
  is_locked: number;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_color: string | null;
  task_count: number;
  open_task_count: number;
};

type TaskRow = {
  id: number;
  initiative_id: number;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  notes: string | null;
  due_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export class PlanningCanvasRepository {
  constructor(private readonly db: Database.Database) {}

  ensureDefaultCanvas(now = nowIso()): PlanningCanvas {
    const existing = this.findByName("Default");
    if (existing) {
      return existing;
    }

    const startDate = monthStartDate(new Date());
    const result = this.db
      .prepare(
        `insert into planning_canvases (name, description, default_start_date, default_zoom, created_at, updated_at)
         values ('Default', ?, ?, 'month', ?, ?)`
      )
      .run("Default initiative planning canvas", startDate, now, now);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): PlanningCanvas | null {
    const row = this.db.prepare("select * from planning_canvases where id = ?").get(id) as PlanningCanvasRow | undefined;
    return row ? toPlanningCanvas(row) : null;
  }

  getView(input: { canvasId?: number; filters?: PlanningCanvasViewFilters } = {}): PlanningCanvasView {
    const canvas = input.canvasId ? this.findById(input.canvasId) : this.ensureDefaultCanvas();
    if (!canvas) {
      throw new Error(`Planning canvas not found: ${input.canvasId}`);
    }

    const nodes = this.listNodesWithInitiatives(canvas.id, { type: "project" });
    const nodeInitiativeIds = nodes.map((node) => node.initiativeId);
    const tasksByInitiative = this.listTasksByInitiativeIds(nodeInitiativeIds);
    const nodesWithTasks = nodes.map((node) => ({
      ...node,
      tasks: tasksByInitiative.get(node.initiativeId) ?? []
    }));

    return {
      canvas,
      nodes: nodesWithTasks,
      unmappedInitiatives: this.listUnmappedInitiatives(canvas.id, { ...input.filters, type: "project" }),
      relationEdges: this.listRelationEdgesForInitiatives(nodeInitiativeIds)
    };
  }

  createNode(
    input: {
      canvasId?: number;
      initiativeId: number;
      x: number;
      y: number;
      width?: number | null;
      height?: number | null;
      collapsed?: boolean;
    },
    now = nowIso()
  ): PlanningCanvasNode {
    const canvas = input.canvasId ? this.findById(input.canvasId) : this.ensureDefaultCanvas(now);
    if (!canvas) {
      throw new Error(`Planning canvas not found: ${input.canvasId}`);
    }
    if (!this.initiativeExists(input.initiativeId)) {
      throw new Error(`Initiative not found: ${input.initiativeId}`);
    }

    this.db
      .prepare(
        `insert into planning_canvas_nodes
          (canvas_id, initiative_id, x, y, width, height, collapsed, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(canvas_id, initiative_id) do update set
           x = excluded.x,
           y = excluded.y,
           width = excluded.width,
           height = excluded.height,
           collapsed = excluded.collapsed,
           updated_at = excluded.updated_at`
      )
      .run(
        canvas.id,
        input.initiativeId,
        input.x,
        input.y,
        input.width ?? null,
        input.height ?? null,
        input.collapsed ? 1 : 0,
        now,
        now
      );

    return this.findNodeByCanvasAndInitiative(canvas.id, input.initiativeId)!;
  }

  updateNode(
    input: {
      id: number;
      x?: number;
      y?: number;
      width?: number | null;
      height?: number | null;
      collapsed?: boolean;
    },
    now = nowIso()
  ): PlanningCanvasNode {
    const existing = this.findNodeById(input.id);
    if (!existing) {
      throw new Error(`Planning canvas node not found: ${input.id}`);
    }

    this.db
      .prepare(
        `update planning_canvas_nodes
         set x = ?, y = ?, width = ?, height = ?, collapsed = ?, updated_at = ?
         where id = ?`
      )
      .run(
        input.x ?? existing.x,
        input.y ?? existing.y,
        input.width === undefined ? existing.width : input.width,
        input.height === undefined ? existing.height : input.height,
        input.collapsed === undefined ? (existing.collapsed ? 1 : 0) : input.collapsed ? 1 : 0,
        now,
        input.id
      );

    return this.findNodeById(input.id)!;
  }

  deleteNode(id: number): PlanningCanvasNode | null {
    const existing = this.findNodeById(id);
    if (!existing) {
      return null;
    }

    this.db.prepare("delete from planning_canvas_nodes where id = ?").run(id);
    return existing;
  }

  findNodeById(id: number): PlanningCanvasNode | null {
    const row = this.db.prepare("select * from planning_canvas_nodes where id = ?").get(id) as PlanningCanvasNodeRow | undefined;
    return row ? toPlanningCanvasNode(row) : null;
  }

  private findByName(name: string): PlanningCanvas | null {
    const row = this.db.prepare("select * from planning_canvases where name = ?").get(name) as PlanningCanvasRow | undefined;
    return row ? toPlanningCanvas(row) : null;
  }

  private findNodeByCanvasAndInitiative(canvasId: number, initiativeId: number): PlanningCanvasNode | null {
    const row = this.db
      .prepare("select * from planning_canvas_nodes where canvas_id = ? and initiative_id = ?")
      .get(canvasId, initiativeId) as PlanningCanvasNodeRow | undefined;
    return row ? toPlanningCanvasNode(row) : null;
  }

  private listNodesWithInitiatives(canvasId: number, filters: PlanningCanvasViewFilters = {}): Array<Omit<PlanningCanvasInitiativeNode, "tasks">> {
    const { where, params } = initiativeFilterSql(filters, "i");
    const rows = this.db
      .prepare(
        `select
          n.*,
          i.id as initiative_id_join,
          i.category_id,
          i.parent_id,
          i.type,
          i.project_phase,
          i.name,
          i.status,
          i.summary,
          i.markdown,
          i.start_date,
          i.end_date,
          i.is_locked,
          i.sort_order,
          i.is_system,
          i.created_at as initiative_created_at,
          i.updated_at as initiative_updated_at,
          c.name as category_name,
          c.color as category_color,
          count(t.id) as task_count,
          sum(case when t.status = 'open' then 1 else 0 end) as open_task_count,
          sum(case when t.status = 'done' then 1 else 0 end) as done_task_count,
          max(case when b.id is not null then 1 else 0 end) as has_google_calendar_binding
         from planning_canvas_nodes n
         join initiatives i on i.id = n.initiative_id
         left join categories c on c.id = i.category_id
         left join tasks t on t.initiative_id = i.id
         left join calendar_event_bindings b
           on b.local_entity_type = 'initiative_project_span'
          and b.local_entity_id = i.id
          and b.unlinked_at is null
         where n.canvas_id = ?${where ? ` and ${where}` : ""}
         group by n.id
         order by n.y asc, n.x asc, lower(i.name) asc, n.id asc`
      )
      .all(canvasId, ...params) as InitiativeCanvasRow[];
    return rows.map(toPlanningCanvasInitiativeNode);
  }

  private listUnmappedInitiatives(
    canvasId: number,
    filters: PlanningCanvasViewFilters = {}
  ): PlanningCanvasView["unmappedInitiatives"] {
    const { where, params } = initiativeFilterSql(filters, "i");
    const rows = this.db
      .prepare(
        `select
          i.*,
          c.name as category_name,
          c.color as category_color,
          count(t.id) as task_count,
          sum(case when t.status = 'open' then 1 else 0 end) as open_task_count
         from initiatives i
         left join categories c on c.id = i.category_id
         left join tasks t on t.initiative_id = i.id
         left join planning_canvas_nodes n on n.canvas_id = ? and n.initiative_id = i.id
         where n.id is null${where ? ` and ${where}` : ""}
         group by i.id
         order by c.sort_order asc, i.sort_order asc, lower(i.name) asc, i.id asc
         limit 200`
      )
      .all(canvasId, ...params) as UnmappedInitiativeRow[];
    return rows.map((row) => ({
      initiative: initiativeFromRow(row),
      category:
        row.category_name === null
          ? null
          : {
              id: row.category_id,
              name: row.category_name,
              color: row.category_color ?? "#27806f"
            },
      taskCount: row.task_count,
      openTaskCount: row.open_task_count ?? 0
    }));
  }

  private listTasksByInitiativeIds(initiativeIds: number[]): Map<number, Task[]> {
    if (initiativeIds.length === 0) {
      return new Map();
    }

    const placeholders = initiativeIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `select * from tasks
         where initiative_id in (${placeholders})
         order by initiative_id asc, status asc, due_at is null, due_at asc, sort_order asc, id asc`
      )
      .all(...initiativeIds) as TaskRow[];
    const byInitiative = new Map<number, Task[]>();
    for (const row of rows) {
      const task = taskFromRow(row);
      byInitiative.set(task.initiativeId, [...(byInitiative.get(task.initiativeId) ?? []), task]);
    }
    return byInitiative;
  }

  private listRelationEdgesForInitiatives(initiativeIds: number[]): PlanningCanvasRelationEdge[] {
    if (initiativeIds.length === 0) {
      return [];
    }

    const placeholders = initiativeIds.map(() => "?").join(", ");
    const parentEdges = this.db
      .prepare(
        `select parent_id as from_initiative_id, id as to_initiative_id
         from initiatives
         where parent_id is not null
           and id in (${placeholders})
           and parent_id in (${placeholders})`
      )
      .all(...initiativeIds, ...initiativeIds) as Array<{ from_initiative_id: number; to_initiative_id: number }>;
    const predecessorEdges = this.db
      .prepare(
        `select id, predecessor_initiative_id, successor_initiative_id
         from initiative_relations
         where relation_type = 'precedes'
           and predecessor_initiative_id in (${placeholders})
           and successor_initiative_id in (${placeholders})
         order by id asc`
      )
      .all(...initiativeIds, ...initiativeIds) as Array<{
      id: number;
      predecessor_initiative_id: number;
      successor_initiative_id: number;
    }>;

    return [
      ...parentEdges.map((edge) => ({
        kind: "parent_child" as const,
        fromInitiativeId: edge.from_initiative_id,
        toInitiativeId: edge.to_initiative_id,
        relationId: null
      })),
      ...predecessorEdges.map((edge) => ({
        kind: "precedes" as const,
        fromInitiativeId: edge.predecessor_initiative_id,
        toInitiativeId: edge.successor_initiative_id,
        relationId: edge.id
      }))
    ];
  }

  private initiativeExists(id: number): boolean {
    return Boolean(this.db.prepare("select 1 from initiatives where id = ?").get(id));
  }
}

function toPlanningCanvas(row: PlanningCanvasRow): PlanningCanvas {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultStartDate: row.default_start_date,
    defaultZoom: row.default_zoom,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPlanningCanvasNode(row: PlanningCanvasNodeRow): PlanningCanvasNode {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    initiativeId: row.initiative_id,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    collapsed: row.collapsed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toPlanningCanvasInitiativeNode(row: InitiativeCanvasRow): Omit<PlanningCanvasInitiativeNode, "tasks"> {
  return {
    ...toPlanningCanvasNode(row),
    initiative: initiativeFromRow({
      id: row.initiative_id_join,
      category_id: row.category_id,
      parent_id: row.parent_id,
      type: row.type,
      project_phase: row.project_phase,
      name: row.name,
      status: row.status,
      summary: row.summary,
      markdown: row.markdown,
      start_date: row.start_date,
      end_date: row.end_date,
      is_locked: row.is_locked,
      sort_order: row.sort_order,
      is_system: row.is_system,
      created_at: row.initiative_created_at,
      updated_at: row.initiative_updated_at
    }),
    category:
      row.category_name === null
        ? null
        : {
            id: row.category_id,
            name: row.category_name,
            color: row.category_color ?? "#27806f"
          },
    taskCount: row.task_count,
    openTaskCount: row.open_task_count ?? 0,
    doneTaskCount: row.done_task_count ?? 0,
    hasGoogleCalendarBinding: row.has_google_calendar_binding === 1
  };
}

function initiativeFromRow(row: {
  id: number;
  category_id: number;
  parent_id: number | null;
  type: InitiativeType;
  project_phase: ProjectPhase;
  name: string;
  status: InitiativeStatus;
  summary: string | null;
  markdown: string;
  start_date: string | null;
  end_date: string | null;
  is_locked: number;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
}): Initiative {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    type: row.type,
    projectPhase: row.project_phase,
    name: row.name,
    status: row.status,
    summary: row.summary,
    markdown: row.markdown,
    startDate: row.start_date,
    endDate: row.end_date,
    isLocked: row.is_locked === 1,
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    dueAt: row.due_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function initiativeFilterSql(filters: PlanningCanvasViewFilters, tableAlias: string): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!filters.includeArchived) {
    conditions.push(`${tableAlias}.status != 'archived'`);
  }
  if (filters.categoryId !== undefined) {
    conditions.push(`${tableAlias}.category_id = ?`);
    params.push(filters.categoryId);
  }
  if (filters.type !== undefined) {
    conditions.push(`${tableAlias}.type = ?`);
    params.push(filters.type);
  }
  if (filters.status !== undefined) {
    conditions.push(`${tableAlias}.status = ?`);
    params.push(filters.status);
  }
  if (filters.search?.trim()) {
    conditions.push(`lower(${tableAlias}.name) like ?`);
    params.push(`%${filters.search.trim().toLowerCase()}%`);
  }

  return { where: conditions.join(" and "), params };
}

function monthStartDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}
