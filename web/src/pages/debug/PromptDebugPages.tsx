import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { EmptyState } from "../../components/ui/index.js";
import type {
  AppPromptLog,
  ContextPayload,
  ContextPayloadBlock,
  ContextPayloadDeduplication,
  ContextPayloadEntity,
  ContextPayloadOmittedEntity,
  ConversationContext,
  PromptTemplateDefinition
} from "../../types.js";

export function PromptTemplatesView(props: {
  templates: PromptTemplateDefinition[];
  onRefresh: () => void;
}) {
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  return (
    <section className="prompt-template-view">
      <div className="prompt-toolbar">
        <div>
          <span className="eyebrow">Agent Context</span>
          <h2>Prompt-Vorlagen</h2>
        </div>
        <button className="small-button" onClick={props.onRefresh}>
          Refresh
        </button>
      </div>

      <div className="prompt-template-list">
        {props.templates.map((template) => {
          const open = openTemplateId === template.id;
          return (
            <section className={`prompt-template-row panel ${open ? "open" : ""}`} key={template.id}>
              <button
                type="button"
                className="prompt-template-trigger"
                aria-expanded={open}
                onClick={() => setOpenTemplateId((current) => current === template.id ? null : template.id)}
              >
                <div>
                  <h3>{template.name}</h3>
                  <p>{template.route}</p>
              </div>
              <div className="prompt-template-row-meta">
                <span>{template.displayContext ?? template.effectiveContext}</span>
                <ChevronDown className="prompt-template-chevron" size={18} aria-hidden="true" />
              </div>
              </button>
              {open ? (
                <div className="prompt-template-detail">
                  <PromptSection title="System / Instructions" text={template.systemInstructions} />
                  <PromptSection title="Kontextdaten Template" text={template.contextDataTemplate} />
                  <PromptSection title="Finaler Prompt Template" text={template.finalPromptTemplate} emphasis />
                </div>
              ) : null}
            </section>
          );
        })}
        {props.templates.length === 0 ? <EmptyState title="Keine Prompt-Vorlagen geladen." /> : null}
      </div>
    </section>
  );
}

export function PromptInspectorView(props: {
  prompts: AppPromptLog[];
  selectedPromptId: number | null;
  onSelectPrompt: (id: number) => void;
  onRefresh: () => void;
}) {
  const selected = props.prompts.find((prompt) => prompt.id === props.selectedPromptId) ?? props.prompts.at(-1) ?? null;

  return (
    <section className="prompt-inspector">
      <div className="prompt-toolbar">
        <div>
          <span className="eyebrow">Debug</span>
          <h2>Prompt Inspector</h2>
        </div>
        <button className="small-button" onClick={props.onRefresh}>
          Refresh
        </button>
      </div>

      <div className="prompt-inspector-layout">
        <aside className="prompt-log-list">
          {props.prompts.map((prompt) => (
            <button
              key={prompt.id}
              className={`prompt-log-row ${selected?.id === prompt.id ? "active" : ""}`}
              onClick={() => props.onSelectPrompt(prompt.id)}
            >
              <strong>Prompt #{prompt.id}</strong>
              <span>{formatPromptTimestamp(prompt.createdAt)}</span>
              <small>
                {prompt.contextType}
                {prompt.contextEntityId ? ` #${prompt.contextEntityId}` : ""} · conversation {prompt.conversationId ?? "none"}
              </small>
            </button>
          ))}
          {props.prompts.length === 0 ? <EmptyState title="Noch keine OpenClaw-Prompts geloggt." /> : null}
        </aside>

        <div className="prompt-detail">
          {!selected ? (
            <EmptyState title="Kein Prompt ausgewählt." />
          ) : (
            <>
              <div className="prompt-meta panel">
                <div>
                  <span>Zeitpunkt</span>
                  <strong>{formatPromptTimestamp(selected.createdAt)}</strong>
                </div>
                <div>
                  <span>Kontext</span>
                  <strong>
                    {selected.contextType}
                    {selected.contextEntityId ? ` #${selected.contextEntityId}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Conversation</span>
                  <strong>{selected.conversationId ?? "none"}</strong>
                </div>
                <div>
                  <span>OpenClaw Session</span>
                  <strong>{selected.openClawSessionId}</strong>
                </div>
                <button
                  className="small-button prompt-copy-button"
                  onClick={() => void navigator.clipboard.writeText(selected.finalPrompt)}
                  title="Finalen Prompt kopieren"
                >
                  <Copy size={15} />
                  Copy Final
                </button>
              </div>

              {selected.turnTrace ? <TurnTracePanel trace={selected.turnTrace} /> : null}
              <PromptSection title="User Input" text={selected.userInput} />
              <PromptSection title="System / Instructions" text={selected.systemInstructions} />
              <ContextPayloadDebugView payload={selected.contextPayload} finalPromptChars={selected.finalPrompt.length} contextType={selected.contextType} />
              <PromptSection title="Kontextdaten" text={selected.contextData} />
              <PromptSection title="Memory / Historie" text={selected.memoryHistory} />
              <PromptSection title="Tools / Funktionen" text={selected.tools} />
              <PromptSection title="Finaler Prompt" text={selected.finalPrompt} emphasis />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function TurnTracePanel({ trace }: { trace: AppPromptLog["turnTrace"] }) {
  if (!trace) {
    return null;
  }

  const latestRun = trace.openClaw?.runs.at(-1) ?? null;
  return (
    <section className="prompt-section turn-trace-panel">
      <div className="turn-trace-heading">
        <h3>Turn Timeline</h3>
        <span>{trace.totalMs !== null ? formatDuration(trace.totalMs) : "läuft"}</span>
      </div>
      <p className="turn-trace-id">{trace.traceId}</p>
      {latestRun ? (
        <div className="turn-trace-summary">
          <div>
            <span>Vor OpenClaw Session</span>
            <strong>{formatNullableDuration(latestRun.preSessionDelayMs)}</strong>
          </div>
          <div>
            <span>Session bis Model Done</span>
            <strong>{formatNullableDuration(latestRun.sessionToModelCompletedMs)}</strong>
          </div>
          <div>
            <span>Tools</span>
            <strong>{latestRun.toolCount ?? "n/a"}</strong>
          </div>
          <div>
            <span>Tokens</span>
            <strong>{formatUsageTotal(latestRun.usage)}</strong>
          </div>
        </div>
      ) : null}
      <ol className="turn-trace-events">
        {trace.events.map((event, index) => (
          <li key={`${event.label}-${index}`}>
            <span>{formatDuration(event.msFromStart)}</span>
            <strong>{event.label}</strong>
            {event.detail ? <small>{formatTraceDetail(event.detail)}</small> : null}
          </li>
        ))}
      </ol>
      {trace.openClaw?.runs.length ? (
        <ol className="turn-trace-events openclaw-runs">
          {trace.openClaw.runs.map((run) => (
            <li key={run.runId}>
              <span>{formatNullableDuration(run.preSessionDelayMs)}</span>
              <strong>openclaw.session.started</strong>
              <small>
                model {formatNullableDuration(run.sessionToModelCompletedMs)} · total {formatNullableDuration(run.sessionToEndedMs)}
              </small>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ContextPayloadDebugView(props: {
  payload: AppPromptLog["contextPayload"];
  finalPromptChars: number;
  contextType: ConversationContext["type"];
}) {
  const normalized = normalizeContextPayload(props.payload);
  const payload = normalized.payload;
  const loadedEntities = payload?.loadedEntities ?? [];
  const omittedEntities = payload?.omittedEntities ?? [];
  const blocks = payload?.blocks ?? [];
  const deduplications = payload?.deduplications ?? [];
  const truncatedBlocks = blocks.filter((block) => block.truncated);
  const omittedBlocks = blocks.filter((block) => block.omitted);
  const contextMode = formatContextPayloadContext(payload?.context) ?? props.contextType;

  return (
    <section className="prompt-section context-payload-debug">
      <div className="context-debug-heading">
        <div>
          <h3>Context Payload Debug</h3>
          <p>Strukturierte Sicht auf geladene Entities, Budgeting, Truncation und Deduplikation.</p>
        </div>
        <span>{props.finalPromptChars.toLocaleString("de-DE")} chars final prompt</span>
      </div>

      <details className="context-debug-details" open>
        <summary>Overview</summary>
        <div className="context-debug-overview">
          <ContextDebugStat label="Context Mode" value={contextMode} />
          <ContextDebugStat label="Title" value={payload?.title ?? "none"} />
          <ContextDebugStat label="Version" value={formatUnknown(payload?.version)} />
          <ContextDebugStat label="Data Sources" value={(payload?.dataSources ?? []).join(", ") || "none"} />
          <ContextDebugStat label="Loaded Entities" value={String(loadedEntities.length)} />
          <ContextDebugStat label="Omitted Entities" value={String(omittedEntities.length)} tone={omittedEntities.length > 0 ? "warn" : undefined} />
          <ContextDebugStat label="Blocks" value={String(blocks.length)} />
          <ContextDebugStat label="Truncated Blocks" value={String(truncatedBlocks.length)} tone={truncatedBlocks.length > 0 ? "warn" : undefined} />
          <ContextDebugStat label="Omitted Blocks" value={String(omittedBlocks.length)} tone={omittedBlocks.length > 0 ? "warn" : undefined} />
          <ContextDebugStat label="Deduplications" value={String(deduplications.length)} />
        </div>
      </details>

      <EntityDebugSection title="Loaded Entities" entities={loadedEntities} defaultOpen />
      <OmittedEntityDebugSection entities={omittedEntities} defaultOpen={omittedEntities.length > 0} />
      <BlockDebugSection blocks={blocks} defaultOpen={truncatedBlocks.length > 0 || omittedBlocks.length > 0} />
      {deduplications.length > 0 ? <DeduplicationDebugSection deduplications={deduplications} /> : null}
      <JsonDebugSection title="Budgets" value={payload?.budgets ?? []} defaultOpen={false} />
      <JsonDebugSection title="Raw JSON" value={normalized.rawValue} defaultOpen={false} />
      {normalized.warning ? <p className="context-debug-warning">{normalized.warning}</p> : null}
    </section>
  );
}

function ContextDebugStat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={tone ? `context-debug-stat ${tone}` : "context-debug-stat"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EntityDebugSection({ title, entities, defaultOpen = false }: { title: string; entities: ContextPayloadEntity[]; defaultOpen?: boolean }) {
  const grouped = groupByRole(entities);
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>{title} ({entities.length})</summary>
      {entities.length === 0 ? (
        <p className="muted-text">none</p>
      ) : (
        <div className="context-debug-role-groups">
          {grouped.map(([role, roleEntities]) => (
            <div className="context-debug-role-group" key={role}>
              <h4>{role}</h4>
              <ContextDebugTable
                headers={["Type", "ID", "Title", "Kind", "Chars", "State"]}
                rows={roleEntities.map((entity) => [
                  entity.entityType ?? "unknown",
                  <code>{entity.id ?? "n/a"}</code>,
                  entity.title ?? "none",
                  entity.kind ?? "none",
                  formatOptionalNumber(entity.emittedChars),
                  entity.truncated ? <DebugBadge label="truncated" tone="warn" /> : <DebugBadge label="full" />
                ])}
              />
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function OmittedEntityDebugSection({ entities, defaultOpen = false }: { entities: ContextPayloadOmittedEntity[]; defaultOpen?: boolean }) {
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>Omitted Entities ({entities.length})</summary>
      {entities.length === 0 ? (
        <p className="muted-text">none</p>
      ) : (
        <ContextDebugTable
          headers={["Role", "Type", "ID", "Title", "Reason", "Original Chars"]}
          rows={entities.map((entity) => [
            entity.role ?? "unknown",
            entity.entityType ?? "unknown",
            <code>{entity.id ?? "n/a"}</code>,
            entity.title ?? "none",
            <DebugBadge label={entity.reason ?? "unknown"} tone="warn" />,
            formatOptionalNumber(entity.originalChars)
          ])}
        />
      )}
    </details>
  );
}

function BlockDebugSection({ blocks, defaultOpen = false }: { blocks: ContextPayloadBlock[]; defaultOpen?: boolean }) {
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>Blocks / Budget & Truncation ({blocks.length})</summary>
      {blocks.length === 0 ? (
        <p className="muted-text">none</p>
      ) : (
        <ContextDebugTable
          headers={["Label", "Kind", "Original", "Emitted", "State", "Reason"]}
          rows={blocks.map((block) => [
            block.label ?? block.id ?? "unnamed",
            block.kind ?? "unknown",
            formatOptionalNumber(block.originalChars),
            formatOptionalNumber(block.emittedChars),
            <span className="context-debug-badge-row">
              {block.truncated ? <DebugBadge label="truncated" tone="warn" /> : null}
              {block.omitted ? <DebugBadge label="omitted" tone="danger" /> : null}
              {!block.truncated && !block.omitted ? <DebugBadge label="full" /> : null}
            </span>,
            block.reason ? <DebugBadge label={block.reason} tone={block.reason === "duplicate" ? "info" : "warn"} /> : "none"
          ])}
        />
      )}
    </details>
  );
}

function DeduplicationDebugSection({ deduplications }: { deduplications: ContextPayloadDeduplication[] }) {
  return (
    <details className="context-debug-details">
      <summary>Deduplications ({deduplications.length})</summary>
      <ContextDebugTable
        headers={["Source Block", "Duplicate Of", "Reason"]}
        rows={deduplications.map((deduplication) => [
          <code>{deduplication.sourceBlock ?? "unknown"}</code>,
          <code>{deduplication.duplicateOf ?? "unknown"}</code>,
          deduplication.reason ?? "none"
        ])}
      />
    </details>
  );
}

function JsonDebugSection({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>{title}</summary>
      <pre className="context-debug-json">{formatJson(value)}</pre>
    </details>
  );
}

function ContextDebugTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="context-debug-table-wrap">
      <table className="context-debug-table">
        <thead>
          <tr>
            {headers.map((header) => <th key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DebugBadge({ label, tone }: { label: string; tone?: "warn" | "danger" | "info" }) {
  return <span className={tone ? `context-debug-badge ${tone}` : "context-debug-badge"}>{label}</span>;
}

function normalizeContextPayload(payload: AppPromptLog["contextPayload"]): { payload: ContextPayload | null; rawValue: unknown; warning?: string } {
  if (!payload) {
    return { payload: null, rawValue: {}, warning: "No context payload was stored for this prompt log." };
  }
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return isRecord(parsed) ? { payload: coerceContextPayload(parsed), rawValue: parsed } : { payload: null, rawValue: payload, warning: "Context payload string did not parse to an object." };
    } catch {
      return { payload: null, rawValue: payload, warning: "Context payload is a string but could not be parsed as JSON." };
    }
  }
  return { payload: coerceContextPayload(payload), rawValue: payload };
}

function coerceContextPayload(value: Record<string, unknown>): ContextPayload {
  return {
    ...value,
    dataSources: stringArray(value.dataSources),
    current: unknownArray(value.current),
    parents: unknownArray(value.parents),
    children: unknownArray(value.children),
    siblings: unknownArray(value.siblings),
    neighbors: unknownArray(value.neighbors),
    related: unknownArray(value.related),
    limits: unknownArray(value.limits),
    notes: stringArray(value.notes),
    loadedEntities: recordArray(value.loadedEntities) as ContextPayloadEntity[],
    omittedEntities: recordArray(value.omittedEntities) as ContextPayloadOmittedEntity[],
    blocks: recordArray(value.blocks) as ContextPayloadBlock[],
    deduplications: recordArray(value.deduplications) as ContextPayloadDeduplication[]
  };
}

function groupByRole<T extends { role?: string }>(items: T[]): Array<[string, T[]]> {
  const order = ["current", "parent", "child", "sibling", "neighbor", "related", "unknown"];
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = item.role || "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  return [...grouped.entries()].sort(([left], [right]) => order.indexOf(left) - order.indexOf(right));
}

function formatContextPayloadContext(context: unknown): string | null {
  if (!isRecord(context)) return null;
  const type = context.type;
  if (typeof type !== "string") return null;
  const entityId = typeof context.categoryId === "number"
    ? context.categoryId
    : typeof context.initiativeId === "number"
      ? context.initiativeId
      : typeof context.taskId === "number"
        ? context.taskId
        : typeof context.partyId === "number"
          ? context.partyId
          : null;
  return entityId ? `${type} #${entityId}` : type;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatOptionalNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("de-DE") : "n/a";
}

function formatJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function PromptSection({ title, text, emphasis = false }: { title: string; text: string; emphasis?: boolean }) {
  return (
    <section className={`prompt-section ${emphasis ? "emphasis" : ""}`}>
      <h3>{title}</h3>
      <pre>{text || "-"}</pre>
    </section>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function formatNullableDuration(ms: number | null): string {
  return ms === null ? "n/a" : formatDuration(ms);
}

function formatUsageTotal(usage: Record<string, unknown> | null): string {
  const total = usage?.total;
  return typeof total === "number" ? total.toLocaleString("de-DE") : "n/a";
}

function formatTraceDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}`)
    .join(" · ");
}

function formatPromptTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
