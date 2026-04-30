import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { ConversationContextType } from "./app-conversations.js";

export type AppPromptLog = {
  id: number;
  conversationId: number | null;
  userMessageId: number | null;
  openClawSessionId: string;
  contextType: ConversationContextType;
  contextEntityId: number | null;
  userInput: string;
  systemInstructions: string;
  contextData: string;
  memoryHistory: string;
  tools: string;
  finalPrompt: string;
  createdAt: string;
};

type AppPromptLogRow = {
  id: number;
  conversation_id: number | null;
  user_message_id: number | null;
  openclaw_session_id: string;
  context_type: ConversationContextType;
  context_entity_id: number | null;
  user_input: string;
  system_instructions: string;
  context_data: string;
  memory_history: string;
  tools: string;
  final_prompt: string;
  created_at: string;
};

export type CreateAppPromptLogInput = {
  conversationId?: number | null;
  userMessageId?: number | null;
  openClawSessionId: string;
  contextType: ConversationContextType;
  contextEntityId?: number | null;
  userInput: string;
  systemInstructions: string;
  contextData: string;
  memoryHistory: string;
  tools: string;
  finalPrompt: string;
};

function toPromptLog(row: AppPromptLogRow): AppPromptLog {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userMessageId: row.user_message_id,
    openClawSessionId: row.openclaw_session_id,
    contextType: row.context_type,
    contextEntityId: row.context_entity_id,
    userInput: row.user_input,
    systemInstructions: row.system_instructions,
    contextData: row.context_data,
    memoryHistory: row.memory_history,
    tools: row.tools,
    finalPrompt: row.final_prompt,
    createdAt: row.created_at
  };
}

export class AppPromptLogRepository {
  constructor(private readonly db: Database.Database) {}

  list(limit = 200): AppPromptLog[] {
    const rows = this.db
      .prepare("select * from app_prompt_logs order by created_at asc, id asc limit ?")
      .all(limit) as AppPromptLogRow[];
    return rows.map(toPromptLog);
  }

  create(input: CreateAppPromptLogInput, now = nowIso()): AppPromptLog {
    const result = this.db
      .prepare(
        `insert into app_prompt_logs (
          conversation_id,
          user_message_id,
          openclaw_session_id,
          context_type,
          context_entity_id,
          user_input,
          system_instructions,
          context_data,
          memory_history,
          tools,
          final_prompt,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.conversationId ?? null,
        input.userMessageId ?? null,
        input.openClawSessionId,
        input.contextType,
        input.contextEntityId ?? null,
        input.userInput,
        input.systemInstructions,
        input.contextData,
        input.memoryHistory,
        input.tools,
        input.finalPrompt,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): AppPromptLog | null {
    const row = this.db.prepare("select * from app_prompt_logs where id = ?").get(id) as AppPromptLogRow | undefined;
    return row ? toPromptLog(row) : null;
  }
}
