import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ToolContext, ToolResult } from "../core/tool-definitions.js";
import type { ToolRunner } from "../core/tool-runner.js";
import type { ThoughtType, TensionPressure } from "../repositories/thinking.js";
import type { PendingVoiceAction } from "./types.js";

export type VoiceThoughtInput = {
  type: ThoughtType;
  content: string;
  normalizedContent?: string | null;
  maturity?: "spark" | "named" | "connected" | "testable" | "committed" | "operational";
  confidence?: number;
  heat?: number;
};

export type VoiceTensionInput = {
  want: string;
  but: string;
  pressure?: TensionPressure;
};

export type VoiceStartOrResumeBrainstormInput = {
  title: string;
  summary?: string | null;
};

export type VoiceStartOrResumeBrainstormResult = {
  spaceId: number;
  title: string;
  resumed: boolean;
  spokenSummary: string;
};

export type VoiceCaptureThinkingInput = {
  spaceId: number;
  rawInput?: string | null;
  summary?: string | null;
  thoughts: VoiceThoughtInput[];
  tensions?: VoiceTensionInput[];
};

export type VoiceCaptureThinkingResult = {
  sessionId: number;
  savedThoughts: number;
  savedTensions: number;
  topOpenLoop: string | null;
  recommendation: string;
  spokenSummary: string;
};

export type VoiceCommitConfirmedTaskInput = {
  action: PendingVoiceAction;
  sourceThoughtId: number;
  allowInbox?: boolean;
};

export type VoiceCommitConfirmedTaskResult = {
  taskId: number;
  title: string;
  sourceThoughtId: number;
  spokenSummary: string;
};

type ThinkingSpaceLike = {
  id: number;
  title: string;
  summary: string | null;
};

type OpenLoopsLike = {
  recommendation: string;
  unresolvedTensions?: Array<{ want: string; but: string; pressure: string }>;
  taskCandidates?: Array<{ content: string }>;
  projectCandidates?: Array<{ content: string }>;
  hotThoughts?: Array<{ content: string }>;
};

export class VoiceToolBridge {
  constructor(
    private readonly runner: ToolRunner,
    private readonly db: Database.Database
  ) {}

  async startOrResumeBrainstorm(input: VoiceStartOrResumeBrainstormInput): Promise<VoiceStartOrResumeBrainstormResult> {
    const spaces = await this.runTool<ThinkingSpaceLike[]>("listThinkingSpaces", { status: "active" });
    const existing = spaces.find((space) => normalize(space.title) === normalize(input.title));

    if (existing) {
      await this.runTool("getThinkingContext", { spaceId: existing.id });
      return {
        spaceId: existing.id,
        title: existing.title,
        resumed: true,
        spokenSummary: `Brainstorm "${existing.title}" ist wieder offen.`
      };
    }

    const created = await this.runTool<ThinkingSpaceLike>("createThinkingSpace", {
      title: input.title,
      summary: input.summary ?? null
    });

    return {
      spaceId: created.id,
      title: created.title,
      resumed: false,
      spokenSummary: `Brainstorm "${created.title}" läuft.`
    };
  }

  async captureThinking(input: VoiceCaptureThinkingInput): Promise<VoiceCaptureThinkingResult> {
    const session = await this.runTool<{ id: number }>("createThinkingSession", {
      spaceId: input.spaceId,
      source: "realtime_voice",
      rawInput: input.rawInput ?? null,
      summary: input.summary ?? null
    });

    const capturedThoughts = await this.runTool<unknown[]>("captureThoughts", {
      thoughts: input.thoughts.map((thought) => ({
        ...thought,
        spaceId: input.spaceId,
        sessionId: session.id
      }))
    });

    for (const tension of input.tensions ?? []) {
      await this.runTool("createTension", {
        ...tension,
        spaceId: input.spaceId,
        sessionId: session.id
      });
    }

    const openLoops = await this.renderOpenLoops(input.spaceId);
    const topOpenLoop = pickTopOpenLoop(openLoops);

    return {
      sessionId: session.id,
      savedThoughts: capturedThoughts.length,
      savedTensions: input.tensions?.length ?? 0,
      topOpenLoop,
      recommendation: openLoops.recommendation,
      spokenSummary: buildCaptureSpokenSummary(capturedThoughts.length, input.tensions?.length ?? 0, topOpenLoop)
    };
  }

  async renderOpenLoops(spaceId: number): Promise<OpenLoopsLike> {
    return this.runTool<OpenLoopsLike>("renderOpenLoops", { spaceId });
  }

  createPendingTaskAction(input: { thoughtId: number; projectId?: number; title: string; now: string }) {
    return {
      id: randomUUID(),
      tool: "createTask" as const,
      input: {
        ...(input.projectId ? { projectId: input.projectId } : { useInboxIfProjectMissing: true }),
        title: input.title
      },
      summary: `Aufgabe anlegen: ${input.title}`,
      requiresConfirmation: true,
      unsafeAfterInterruption: true,
      idempotencyKey: `createTask:${input.projectId ?? "inbox"}:${normalize(input.title)}:${input.thoughtId}`,
      createdAt: input.now
    };
  }

  async commitConfirmedTask(input: VoiceCommitConfirmedTaskInput): Promise<VoiceCommitConfirmedTaskResult> {
    const gate = await this.runTool<{ status: string; recommendation: string }>("renderTaskGate", {
      thoughtId: input.sourceThoughtId,
      allowInbox: input.allowInbox ?? !("projectId" in (input.action.input as Record<string, unknown>))
    });

    if (gate.status === "blocked") {
      throw new Error(`Task candidate is blocked: ${gate.recommendation}`);
    }

    const task = await this.runTool<{ id: number; title: string }>("createTask", input.action.input);

    await this.runTool("linkThought", {
      fromThoughtId: input.sourceThoughtId,
      toEntityType: "task",
      toEntityId: task.id,
      relation: "extracted_to",
      strength: 1
    });

    await this.runTool("updateThought", {
      id: input.sourceThoughtId,
      maturity: "committed"
    });

    return {
      taskId: task.id,
      title: task.title,
      sourceThoughtId: input.sourceThoughtId,
      spokenSummary: `Aufgabe angelegt: ${task.title}.`
    };
  }

  private async runTool<T>(name: Parameters<ToolRunner["run"]>[0], input: unknown): Promise<T> {
    const context: ToolContext = { db: this.db };
    const result = await this.runner.run(name, input, context);
    return unwrapToolResult<T>(result);
  }
}

function unwrapToolResult<T>(result: ToolResult): T {
  if (result.ok) {
    return result.data as T;
  }

  if ("requiresConfirmation" in result && result.requiresConfirmation) {
    throw new Error(`Unexpected confirmation request from voice bridge: ${result.summary}`);
  }

  if ("error" in result) {
    throw new Error(result.error);
  }

  throw new Error("Unexpected tool result from voice bridge.");
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("de-DE");
}

function pickTopOpenLoop(openLoops: OpenLoopsLike): string | null {
  const tension = openLoops.unresolvedTensions?.[0];
  if (tension) {
    return `${tension.want} vs. ${tension.but}`;
  }

  return openLoops.taskCandidates?.[0]?.content ?? openLoops.projectCandidates?.[0]?.content ?? openLoops.hotThoughts?.[0]?.content ?? null;
}

function buildCaptureSpokenSummary(savedThoughts: number, savedTensions: number, topOpenLoop: string | null): string {
  const saved = savedTensions > 0 ? `${savedThoughts} Gedanken und ${savedTensions} Spannung gespeichert.` : `${savedThoughts} Gedanken gespeichert.`;
  return topOpenLoop ? `${saved} Wichtigster offener Punkt: ${topOpenLoop}.` : saved;
}
