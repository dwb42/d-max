import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type ThinkingSpaceStatus = "active" | "paused" | "archived";
export type ThoughtType =
  | "observation"
  | "desire"
  | "constraint"
  | "question"
  | "hypothesis"
  | "option"
  | "fear"
  | "pattern"
  | "possible_project"
  | "possible_task"
  | "decision"
  | "discarded";
export type ThoughtStatus = "active" | "parked" | "resolved" | "contradicted" | "discarded";
export type ThoughtMaturity = "spark" | "named" | "connected" | "testable" | "committed" | "operational";
export type LinkedEntityType = "thought" | "category" | "project" | "task" | "tension";
export type ThoughtRelation =
  | "supports"
  | "contradicts"
  | "causes"
  | "blocks"
  | "refines"
  | "repeats"
  | "answers"
  | "depends_on"
  | "candidate_for"
  | "extracted_to"
  | "mentions"
  | "context";
export type TensionPressure = "low" | "medium" | "high";
export type TensionStatus = "unresolved" | "parked" | "resolved" | "discarded";

export type ThinkingSpace = {
  id: number;
  title: string;
  summary: string | null;
  status: ThinkingSpaceStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type ThinkingSpaceRow = {
  id: number;
  title: string;
  summary: string | null;
  status: ThinkingSpaceStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ThinkingSession = {
  id: number;
  spaceId: number;
  source: string;
  rawInput: string | null;
  summary: string | null;
  createdAt: string;
};

type ThinkingSessionRow = {
  id: number;
  space_id: number;
  source: string;
  raw_input: string | null;
  summary: string | null;
  created_at: string;
};

export type Thought = {
  id: number;
  spaceId: number;
  sessionId: number | null;
  type: ThoughtType;
  content: string;
  normalizedContent: string | null;
  status: ThoughtStatus;
  maturity: ThoughtMaturity;
  confidence: number;
  heat: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

type ThoughtRow = {
  id: number;
  space_id: number;
  session_id: number | null;
  type: ThoughtType;
  content: string;
  normalized_content: string | null;
  status: ThoughtStatus;
  maturity: ThoughtMaturity;
  confidence: number;
  heat: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type ThoughtLink = {
  id: number;
  fromThoughtId: number;
  toEntityType: LinkedEntityType;
  toEntityId: number;
  relation: ThoughtRelation;
  strength: number;
  createdAt: string;
};

type ThoughtLinkRow = {
  id: number;
  from_thought_id: number;
  to_entity_type: LinkedEntityType;
  to_entity_id: number;
  relation: ThoughtRelation;
  strength: number;
  created_at: string;
};

export type Tension = {
  id: number;
  spaceId: number;
  sessionId: number | null;
  want: string;
  but: string;
  pressure: TensionPressure;
  status: TensionStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

type TensionRow = {
  id: number;
  space_id: number;
  session_id: number | null;
  want: string;
  but: string;
  pressure: TensionPressure;
  status: TensionStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type CreateThinkingSpaceInput = {
  title: string;
  summary?: string | null;
};

export type UpdateThinkingSpaceInput = {
  id: number;
  title?: string;
  summary?: string | null;
  status?: ThinkingSpaceStatus;
};

export type CreateThinkingSessionInput = {
  spaceId: number;
  source?: string;
  rawInput?: string | null;
  summary?: string | null;
};

export type CreateThoughtInput = {
  spaceId: number;
  sessionId?: number | null;
  type: ThoughtType;
  content: string;
  normalizedContent?: string | null;
  maturity?: ThoughtMaturity;
  confidence?: number;
  heat?: number;
};

export type UpdateThoughtInput = {
  id: number;
  type?: ThoughtType;
  content?: string;
  normalizedContent?: string | null;
  status?: ThoughtStatus;
  maturity?: ThoughtMaturity;
  confidence?: number;
  heat?: number;
};

export type CreateThoughtLinkInput = {
  fromThoughtId: number;
  toEntityType: LinkedEntityType;
  toEntityId: number;
  relation: ThoughtRelation;
  strength?: number;
};

export type CreateTensionInput = {
  spaceId: number;
  sessionId?: number | null;
  want: string;
  but: string;
  pressure?: TensionPressure;
};

export type UpdateTensionInput = {
  id: number;
  want?: string;
  but?: string;
  pressure?: TensionPressure;
  status?: TensionStatus;
};

export type OpenLoopsView = {
  space: ThinkingSpace;
  unresolvedTensions: Tension[];
  hotThoughts: Thought[];
  projectCandidates: Thought[];
  taskCandidates: Thought[];
  recommendation: string;
};

export type ThinkingContext = {
  space: ThinkingSpace;
  recentSessions: ThinkingSession[];
  activeThoughts: Thought[];
  unresolvedTensions: Tension[];
  projectCandidates: Thought[];
  taskCandidates: Thought[];
  links: ThoughtLink[];
  openLoops: OpenLoopsView;
};

export type GateStatus = "ready" | "needs_clarification" | "blocked";

export type GateCheck = {
  name: string;
  passed: boolean;
  detail: string;
};

export type ProjectGateView = {
  candidate: Thought;
  status: GateStatus;
  checks: GateCheck[];
  missing: string[];
  recommendation: string;
};

export type TaskGateView = {
  candidate: Thought;
  status: GateStatus;
  checks: GateCheck[];
  missing: string[];
  recommendation: string;
};

function toThinkingSpace(row: ThinkingSpaceRow): ThinkingSpace {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  };
}

function toThinkingSession(row: ThinkingSessionRow): ThinkingSession {
  return {
    id: row.id,
    spaceId: row.space_id,
    source: row.source,
    rawInput: row.raw_input,
    summary: row.summary,
    createdAt: row.created_at
  };
}

function toThought(row: ThoughtRow): Thought {
  return {
    id: row.id,
    spaceId: row.space_id,
    sessionId: row.session_id,
    type: row.type,
    content: row.content,
    normalizedContent: row.normalized_content,
    status: row.status,
    maturity: row.maturity,
    confidence: row.confidence,
    heat: row.heat,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

function toThoughtLink(row: ThoughtLinkRow): ThoughtLink {
  return {
    id: row.id,
    fromThoughtId: row.from_thought_id,
    toEntityType: row.to_entity_type,
    toEntityId: row.to_entity_id,
    relation: row.relation,
    strength: row.strength,
    createdAt: row.created_at
  };
}

function toTension(row: TensionRow): Tension {
  return {
    id: row.id,
    spaceId: row.space_id,
    sessionId: row.session_id,
    want: row.want,
    but: row.but,
    pressure: row.pressure,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at
  };
}

export class ThinkingRepository {
  constructor(private readonly db: Database.Database) {}

  listSpaces(filters: { status?: ThinkingSpaceStatus } = {}): ThinkingSpace[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status !== undefined) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from thinking_spaces ${where} order by updated_at desc, lower(title) asc`)
      .all(...params) as ThinkingSpaceRow[];

    return rows.map(toThinkingSpace);
  }

  findSpaceById(id: number): ThinkingSpace | null {
    const row = this.db.prepare("select * from thinking_spaces where id = ?").get(id) as ThinkingSpaceRow | undefined;
    return row ? toThinkingSpace(row) : null;
  }

  createSpace(input: CreateThinkingSpaceInput, now = nowIso()): ThinkingSpace {
    const result = this.db
      .prepare("insert into thinking_spaces (title, summary, created_at, updated_at) values (?, ?, ?, ?)")
      .run(input.title, input.summary ?? null, now, now);

    return this.findSpaceById(Number(result.lastInsertRowid))!;
  }

  updateSpace(input: UpdateThinkingSpaceInput, now = nowIso()): ThinkingSpace {
    const existing = this.findSpaceById(input.id);

    if (!existing) {
      throw new Error(`Thinking space not found: ${input.id}`);
    }

    const status = input.status ?? existing.status;
    const archivedAt = status === "archived" && existing.archivedAt === null ? now : status === "archived" ? existing.archivedAt : null;

    this.db
      .prepare("update thinking_spaces set title = ?, summary = ?, status = ?, updated_at = ?, archived_at = ? where id = ?")
      .run(
        input.title ?? existing.title,
        input.summary === undefined ? existing.summary : input.summary,
        status,
        now,
        archivedAt,
        input.id
      );

    return this.findSpaceById(input.id)!;
  }

  createSession(input: CreateThinkingSessionInput, now = nowIso()): ThinkingSession {
    this.requireSpace(input.spaceId);

    const result = this.db
      .prepare("insert into thinking_sessions (space_id, source, raw_input, summary, created_at) values (?, ?, ?, ?, ?)")
      .run(input.spaceId, input.source ?? "conversation", input.rawInput ?? null, input.summary ?? null, now);

    this.touchSpace(input.spaceId, now);
    return this.findSessionById(Number(result.lastInsertRowid))!;
  }

  findSessionById(id: number): ThinkingSession | null {
    const row = this.db.prepare("select * from thinking_sessions where id = ?").get(id) as ThinkingSessionRow | undefined;
    return row ? toThinkingSession(row) : null;
  }

  listSessions(filters: { spaceId?: number; limit?: number } = {}): ThinkingSession[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.spaceId !== undefined) {
      conditions.push("space_id = ?");
      params.push(filters.spaceId);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const limit = filters.limit ?? 8;
    const rows = this.db
      .prepare(`select * from thinking_sessions ${where} order by created_at desc, id desc limit ?`)
      .all(...params, limit) as ThinkingSessionRow[];

    return rows.map(toThinkingSession);
  }

  createThought(input: CreateThoughtInput, now = nowIso()): Thought {
    this.requireSpace(input.spaceId);

    if (input.sessionId !== undefined && input.sessionId !== null) {
      this.requireSession(input.sessionId);
    }

    const result = this.db
      .prepare(
        "insert into thoughts (space_id, session_id, type, content, normalized_content, maturity, confidence, heat, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        input.spaceId,
        input.sessionId ?? null,
        input.type,
        input.content,
        input.normalizedContent ?? null,
        input.maturity ?? "spark",
        input.confidence ?? 0.5,
        input.heat ?? 0.5,
        now,
        now
      );

    this.touchSpace(input.spaceId, now);
    return this.findThoughtById(Number(result.lastInsertRowid))!;
  }

  createThoughts(inputs: CreateThoughtInput[], now = nowIso()): Thought[] {
    const createMany = this.db.transaction((items: CreateThoughtInput[]) => items.map((item) => this.createThought(item, now)));
    return createMany(inputs) as Thought[];
  }

  listThoughts(filters: { spaceId?: number; sessionId?: number; type?: ThoughtType; status?: ThoughtStatus } = {}): Thought[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.spaceId !== undefined) {
      conditions.push("space_id = ?");
      params.push(filters.spaceId);
    }

    if (filters.sessionId !== undefined) {
      conditions.push("session_id = ?");
      params.push(filters.sessionId);
    }

    if (filters.type !== undefined) {
      conditions.push("type = ?");
      params.push(filters.type);
    }

    if (filters.status !== undefined) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from thoughts ${where} order by heat desc, updated_at desc, id desc`)
      .all(...params) as ThoughtRow[];

    return rows.map(toThought);
  }

  findThoughtById(id: number): Thought | null {
    const row = this.db.prepare("select * from thoughts where id = ?").get(id) as ThoughtRow | undefined;
    return row ? toThought(row) : null;
  }

  updateThought(input: UpdateThoughtInput, now = nowIso()): Thought {
    const existing = this.findThoughtById(input.id);

    if (!existing) {
      throw new Error(`Thought not found: ${input.id}`);
    }

    const status = input.status ?? existing.status;
    const resolvedAt =
      (status === "resolved" || status === "discarded") && existing.resolvedAt === null
        ? now
        : status === "resolved" || status === "discarded"
          ? existing.resolvedAt
          : null;

    this.db
      .prepare(
        "update thoughts set type = ?, content = ?, normalized_content = ?, status = ?, maturity = ?, confidence = ?, heat = ?, updated_at = ?, resolved_at = ? where id = ?"
      )
      .run(
        input.type ?? existing.type,
        input.content ?? existing.content,
        input.normalizedContent === undefined ? existing.normalizedContent : input.normalizedContent,
        status,
        input.maturity ?? existing.maturity,
        input.confidence ?? existing.confidence,
        input.heat ?? existing.heat,
        now,
        resolvedAt,
        input.id
      );

    this.touchSpace(existing.spaceId, now);
    return this.findThoughtById(input.id)!;
  }

  createThoughtLink(input: CreateThoughtLinkInput, now = nowIso()): ThoughtLink {
    const fromThought = this.requireThought(input.fromThoughtId);
    this.requireLinkedEntity(input.toEntityType, input.toEntityId);

    const result = this.db
      .prepare(
        "insert into thought_links (from_thought_id, to_entity_type, to_entity_id, relation, strength, created_at) values (?, ?, ?, ?, ?, ?)"
      )
      .run(input.fromThoughtId, input.toEntityType, input.toEntityId, input.relation, input.strength ?? 0.5, now);

    this.touchSpace(fromThought.spaceId, now);
    return this.findThoughtLinkById(Number(result.lastInsertRowid))!;
  }

  listThoughtLinks(filters: { fromThoughtId?: number; toEntityType?: LinkedEntityType; toEntityId?: number } = {}): ThoughtLink[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.fromThoughtId !== undefined) {
      conditions.push("from_thought_id = ?");
      params.push(filters.fromThoughtId);
    }

    if (filters.toEntityType !== undefined) {
      conditions.push("to_entity_type = ?");
      params.push(filters.toEntityType);
    }

    if (filters.toEntityId !== undefined) {
      conditions.push("to_entity_id = ?");
      params.push(filters.toEntityId);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db.prepare(`select * from thought_links ${where} order by created_at desc, id desc`).all(...params) as ThoughtLinkRow[];

    return rows.map(toThoughtLink);
  }

  findThoughtLinkById(id: number): ThoughtLink | null {
    const row = this.db.prepare("select * from thought_links where id = ?").get(id) as ThoughtLinkRow | undefined;
    return row ? toThoughtLink(row) : null;
  }

  createTension(input: CreateTensionInput, now = nowIso()): Tension {
    this.requireSpace(input.spaceId);

    if (input.sessionId !== undefined && input.sessionId !== null) {
      this.requireSession(input.sessionId);
    }

    const result = this.db
      .prepare(
        "insert into tensions (space_id, session_id, want, but, pressure, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(input.spaceId, input.sessionId ?? null, input.want, input.but, input.pressure ?? "medium", now, now);

    this.touchSpace(input.spaceId, now);
    return this.findTensionById(Number(result.lastInsertRowid))!;
  }

  listTensions(filters: { spaceId?: number; status?: TensionStatus } = {}): Tension[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.spaceId !== undefined) {
      conditions.push("space_id = ?");
      params.push(filters.spaceId);
    }

    if (filters.status !== undefined) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from tensions ${where} order by case pressure when 'high' then 1 when 'medium' then 2 else 3 end, updated_at desc`)
      .all(...params) as TensionRow[];

    return rows.map(toTension);
  }

  findTensionById(id: number): Tension | null {
    const row = this.db.prepare("select * from tensions where id = ?").get(id) as TensionRow | undefined;
    return row ? toTension(row) : null;
  }

  updateTension(input: UpdateTensionInput, now = nowIso()): Tension {
    const existing = this.findTensionById(input.id);

    if (!existing) {
      throw new Error(`Tension not found: ${input.id}`);
    }

    const status = input.status ?? existing.status;
    const resolvedAt =
      (status === "resolved" || status === "discarded") && existing.resolvedAt === null
        ? now
        : status === "resolved" || status === "discarded"
          ? existing.resolvedAt
          : null;

    this.db
      .prepare("update tensions set want = ?, but = ?, pressure = ?, status = ?, updated_at = ?, resolved_at = ? where id = ?")
      .run(
        input.want ?? existing.want,
        input.but ?? existing.but,
        input.pressure ?? existing.pressure,
        status,
        now,
        resolvedAt,
        input.id
      );

    this.touchSpace(existing.spaceId, now);
    return this.findTensionById(input.id)!;
  }

  renderOpenLoops(spaceId: number): OpenLoopsView {
    const space = this.requireSpace(spaceId);
    const unresolvedTensions = this.listTensions({ spaceId, status: "unresolved" });
    const activeThoughts = this.listThoughts({ spaceId, status: "active" });
    const hotThoughts = activeThoughts.filter((thought) => thought.heat >= 0.65).slice(0, 8);
    const projectCandidates = activeThoughts.filter((thought) => thought.type === "possible_project").slice(0, 8);
    const taskCandidates = activeThoughts.filter((thought) => thought.type === "possible_task").slice(0, 8);

    return {
      space,
      unresolvedTensions,
      hotThoughts,
      projectCandidates,
      taskCandidates,
      recommendation: buildOpenLoopsRecommendation({ unresolvedTensions, projectCandidates, taskCandidates, hotThoughts })
    };
  }

  getThinkingContext(spaceId: number): ThinkingContext {
    const space = this.requireSpace(spaceId);
    const recentSessions = this.listSessions({ spaceId, limit: 8 });
    const activeThoughts = this.listThoughts({ spaceId, status: "active" });
    const unresolvedTensions = this.listTensions({ spaceId, status: "unresolved" });
    const projectCandidates = activeThoughts.filter((thought) => thought.type === "possible_project").slice(0, 8);
    const taskCandidates = activeThoughts.filter((thought) => thought.type === "possible_task").slice(0, 8);
    const links = this.listLinksForSpace(spaceId);

    return {
      space,
      recentSessions,
      activeThoughts,
      unresolvedTensions,
      projectCandidates,
      taskCandidates,
      links,
      openLoops: this.renderOpenLoops(spaceId)
    };
  }

  renderProjectGate(thoughtId: number): ProjectGateView {
    const candidate = this.requireThought(thoughtId);
    const links = this.listThoughtLinks({ fromThoughtId: thoughtId });
    const checks: GateCheck[] = [
      {
        name: "project_candidate",
        passed: candidate.type === "possible_project",
        detail: candidate.type === "possible_project" ? "Thought is marked as a project candidate." : `Thought type is ${candidate.type}.`
      },
      {
        name: "why_clear",
        passed: hasAnySignal(candidate.content, ["because", "so that", "want", "need", "energy", "important", "goal", "why"]),
        detail: "A project should have a visible reason or desired outcome."
      },
      {
        name: "scope_clear",
        passed:
          candidate.maturity === "testable" ||
          candidate.maturity === "committed" ||
          candidate.maturity === "operational" ||
          hasAnySignal(candidate.content, ["week", "month", "quarter", "first", "minimal", "mvp", "scope", "test"]),
        detail: "A project should have a rough boundary, duration, or first slice."
      },
      {
        name: "category_clear",
        passed: links.some((link) => link.toEntityType === "category"),
        detail: "A project needs a category before creation."
      },
      {
        name: "next_step_or_success_signal",
        passed: startsWithActionVerb(candidate.content) || hasAnySignal(candidate.content, ["success", "done", "ship", "launch", "write", "build", "test", "review"]),
        detail: "A project should have either a next step or a success signal."
      }
    ];

    return buildProjectGateView(candidate, checks);
  }

  renderTaskGate(thoughtId: number, options: { allowInbox?: boolean } = {}): TaskGateView {
    const candidate = this.requireThought(thoughtId);
    const links = this.listThoughtLinks({ fromThoughtId: thoughtId });
    const hasProjectContext = links.some((link) => link.toEntityType === "project");
    const checks: GateCheck[] = [
      {
        name: "task_candidate",
        passed: candidate.type === "possible_task",
        detail: candidate.type === "possible_task" ? "Thought is marked as a task candidate." : `Thought type is ${candidate.type}.`
      },
      {
        name: "concrete_action",
        passed: startsWithActionVerb(candidate.content),
        detail: "A task should start from a concrete action, not a vague desire."
      },
      {
        name: "individually_executable",
        passed: candidate.content.length <= 140 && !hasAnySignal(candidate.content, [" and ", ";", " plus ", " as well as "]),
        detail: "A task should be one executable unit."
      },
      {
        name: "project_context",
        passed: hasProjectContext || options.allowInbox === true,
        detail: hasProjectContext ? "Task candidate is linked to a project." : "Task needs a project link or explicit Inbox permission."
      },
      {
        name: "not_speculative",
        passed: candidate.maturity === "committed" || candidate.maturity === "operational" || candidate.confidence >= 0.8,
        detail: "Speculative tasks should be confirmed before creation."
      }
    ];

    return buildTaskGateView(candidate, checks, options.allowInbox === true);
  }

  private listLinksForSpace(spaceId: number): ThoughtLink[] {
    const rows = this.db
      .prepare(
        "select thought_links.* from thought_links join thoughts on thoughts.id = thought_links.from_thought_id where thoughts.space_id = ? order by thought_links.created_at desc, thought_links.id desc"
      )
      .all(spaceId) as ThoughtLinkRow[];

    return rows.map(toThoughtLink);
  }

  private touchSpace(spaceId: number, now: string): void {
    this.db.prepare("update thinking_spaces set updated_at = ? where id = ?").run(now, spaceId);
  }

  private requireSpace(id: number): ThinkingSpace {
    const space = this.findSpaceById(id);

    if (!space) {
      throw new Error(`Thinking space not found: ${id}`);
    }

    return space;
  }

  private requireSession(id: number): ThinkingSession {
    const session = this.findSessionById(id);

    if (!session) {
      throw new Error(`Thinking session not found: ${id}`);
    }

    return session;
  }

  private requireThought(id: number): Thought {
    const thought = this.findThoughtById(id);

    if (!thought) {
      throw new Error(`Thought not found: ${id}`);
    }

    return thought;
  }

  private requireLinkedEntity(type: LinkedEntityType, id: number): void {
    if (type === "thought") {
      this.requireThought(id);
      return;
    }

    if (type === "tension") {
      const tension = this.findTensionById(id);

      if (!tension) {
        throw new Error(`Tension not found: ${id}`);
      }
    }
  }
}

function buildProjectGateView(candidate: Thought, checks: GateCheck[]): ProjectGateView {
  const missing = checks.filter((check) => !check.passed).map((check) => check.name);
  const status = checks[0]?.passed === false ? "blocked" : missing.length === 0 ? "ready" : "needs_clarification";
  const recommendation =
    status === "ready"
      ? "Project candidate is ready for explicit confirmation before createProject."
      : status === "blocked"
        ? "Do not create a project from this thought; keep it in Thinking Memory or reclassify it."
        : `Clarify before creating a project: ${missing.join(", ")}.`;

  return {
    candidate,
    status,
    checks,
    missing,
    recommendation
  };
}

function buildTaskGateView(candidate: Thought, checks: GateCheck[], allowInbox: boolean): TaskGateView {
  const missing = checks.filter((check) => !check.passed).map((check) => check.name);
  const status = checks[0]?.passed === false ? "blocked" : missing.length === 0 ? "ready" : "needs_clarification";
  const recommendation =
    status === "ready"
      ? allowInbox
        ? "Task candidate is ready for explicit confirmation before createTask; Inbox is allowed if no project is linked."
        : "Task candidate is ready for explicit confirmation before createTask."
      : status === "blocked"
        ? "Do not create a task from this thought; keep it in Thinking Memory or reclassify it."
        : `Clarify before creating a task: ${missing.join(", ")}.`;

  return {
    candidate,
    status,
    checks,
    missing,
    recommendation
  };
}

function hasAnySignal(value: string, signals: string[]): boolean {
  const normalized = value.toLowerCase();
  return signals.some((signal) => normalized.includes(signal));
}

function startsWithActionVerb(value: string): boolean {
  const firstWord = value.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return [
    "add",
    "ask",
    "build",
    "call",
    "capture",
    "check",
    "clarify",
    "create",
    "define",
    "draft",
    "find",
    "implement",
    "plan",
    "review",
    "schedule",
    "send",
    "set",
    "ship",
    "test",
    "update",
    "write"
  ].includes(firstWord);
}

function buildOpenLoopsRecommendation(input: {
  unresolvedTensions: Tension[];
  projectCandidates: Thought[];
  taskCandidates: Thought[];
  hotThoughts: Thought[];
}): string {
  if (input.unresolvedTensions.length > 0) {
    return "Resolve or sharpen the highest-pressure tension before creating execution work.";
  }

  if (input.projectCandidates.length > 0) {
    return "Review project candidates through the project gate before creating projects.";
  }

  if (input.taskCandidates.length > 0) {
    return "Review task candidates through the task gate before creating tasks.";
  }

  if (input.hotThoughts.length > 0) {
    return "Distill the hottest active thoughts into a question, tension, candidate, or decision.";
  }

  return "No major open loops are visible in this thinking space.";
}
