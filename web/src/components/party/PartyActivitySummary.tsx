import { useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, Clock, Mail, MapPin, MessageSquareText, Phone, Send, Users } from "lucide-react";
import type { OrganizationPersonActivity, PartyActivitySummary, PartyActivityStats, PartyNextAction } from "../../types.js";

type PartyActivitySummaryVariant = "default" | "taskParticipant";

export function PartyActivitySummaryCard(props: {
  summary: PartyActivitySummary | null;
  title?: string;
  compact?: boolean;
  variant?: PartyActivitySummaryVariant;
  onOpenTask?: (taskId: number) => void;
}) {
  if (!props.summary) {
    return <div className="party-activity-summary muted">Aktivität wird geladen</div>;
  }

  const variant = props.variant ?? "default";
  const nextAction = variant === "taskParticipant" && props.summary.nextAction?.status !== "open"
    ? null
    : props.summary.nextAction;

  return (
    <div className={`party-activity-summary${props.compact ? " compact" : ""}`}>
      {props.title ? <strong className="party-activity-title">{props.title}</strong> : null}
      {variant === "taskParticipant" ? (
        <>
          <NextActionWidget action={nextAction} compact={props.compact} variant={variant} onOpenTask={props.onOpenTask} />
          <CommunicationBadges summary={props.summary} compact={props.compact} variant={variant} />
        </>
      ) : (
        <>
          <CommunicationBadges summary={props.summary} compact={props.compact} />
          <NextActionWidget action={nextAction} compact={props.compact} onOpenTask={props.onOpenTask} />
        </>
      )}
    </div>
  );
}

export function CommunicationBadges(props: { summary: PartyActivitySummary; compact?: boolean; variant?: PartyActivitySummaryVariant }) {
  const variant = props.variant ?? "default";
  const badges = summaryBadges(props.summary, variant);
  if (badges.length === 0) {
    if (variant === "taskParticipant") return null;
    return <span className="activity-empty-inline">Keine Aktivität</span>;
  }

  return (
    <div className={`communication-badges${props.compact ? " compact" : ""}`}>
      {badges.map((badge) => (
        <span className="communication-badge" key={badge.key} title={badge.title}>
          {badge.icon}
          <span>{badge.label}</span>
        </span>
      ))}
    </div>
  );
}

export function NextActionWidget(props: {
  action: PartyNextAction | null;
  compact?: boolean;
  variant?: PartyActivitySummaryVariant;
  onOpenTask?: (taskId: number) => void;
}) {
  const variant = props.variant ?? "default";
  if (!props.action) {
    if (variant === "taskParticipant") return null;
    return <div className={`next-action-widget empty${props.compact ? " compact" : ""}`}>Keine nächste Maßnahme</div>;
  }

  const content = variant === "taskParticipant"
    ? (
      <>
        <span className={`next-action-date-pill ${taskDueTone(props.action.dueAt)}`}>{formatTaskParticipantDueDate(props.action.dueAt)}</span>
        <span className="next-action-title">{props.action.title}</span>
      </>
    )
    : (
      <>
        <span className="next-action-date">{props.action.dueAt ? formatDate(props.action.dueAt) : "Ohne Datum"}</span>
        <span className="next-action-title">{props.action.title}</span>
        <span className="next-action-meta">{taskStatusLabel(props.action.status)}</span>
      </>
    );
  const className = `next-action-widget${props.compact ? " compact" : ""}${variant === "taskParticipant" ? " task-participant-next-action" : ""}`;

  if (props.onOpenTask) {
    return (
      <button type="button" className={`${className} openable`} onClick={() => props.onOpenTask?.(props.action!.taskId)}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function OrganizationPeopleActivityList(props: {
  people: OrganizationPersonActivity[];
  initialVisible?: number;
  variant?: PartyActivitySummaryVariant;
  onOpenPerson?: (partyId: number) => void;
  onOpenTask?: (taskId: number) => void;
}) {
  const initialVisible = props.initialVisible ?? 3;
  const [expanded, setExpanded] = useState(false);
  const visiblePeople = expanded ? props.people : props.people.slice(0, initialVisible);

  if (props.people.length === 0) {
    return <span className="activity-empty-inline">Keine aktiven Personen</span>;
  }

  return (
    <div className="organization-people-activity-list">
      {visiblePeople.map((person) => (
        <div className="organization-person-activity-row" key={person.partyId}>
          <button
            type="button"
            className="organization-person-activity-title"
            onClick={() => props.onOpenPerson?.(person.partyId)}
            disabled={!props.onOpenPerson}
          >
            <span>{person.displayName}</span>
            <small>{[person.relationshipLabel, person.roleLabel].filter(Boolean).join(" · ")}</small>
          </button>
          {props.variant === "taskParticipant" ? (
            <>
              <NextActionWidget action={person.summary.nextAction?.status === "open" ? person.summary.nextAction : null} compact variant={props.variant} onOpenTask={props.onOpenTask} />
              <CommunicationBadges summary={person.summary} compact variant={props.variant} />
            </>
          ) : (
            <>
              <CommunicationBadges summary={person.summary} compact />
              <NextActionWidget action={person.summary.nextAction} compact onOpenTask={props.onOpenTask} />
            </>
          )}
        </div>
      ))}
      {props.people.length > initialVisible ? (
        <button type="button" className="activity-show-more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Weniger anzeigen" : `Weitere anzeigen (${props.people.length - initialVisible})`}
        </button>
      ) : null}
    </div>
  );
}

function summaryBadges(summary: PartyActivitySummary, variant: PartyActivitySummaryVariant): Array<{ key: string; label: string; title: string; icon: ReactNode }> {
  const stats = summary.stats;
  const badges: Array<{ key: string; label: string; title: string; icon: ReactNode }> = [];
  if (variant === "taskParticipant") {
    if (summary.lastContactAt) badges.push({ key: "lastContactAt", label: `letzter Kontakt ${formatDate(summary.lastContactAt)}`, title: "Letzter Kontakt", icon: <Clock size={13} /> });
    if (stats.emailOutbound > 0) badges.push({ key: "emailOutbound", label: `${stats.emailOutbound} gesendet`, title: "E-Mail gesendet", icon: <Send size={13} /> });
    if (stats.emailInbound > 0) badges.push({ key: "emailInbound", label: `${stats.emailInbound} empfangen`, title: "E-Mail empfangen", icon: <Mail size={13} /> });
    if (summary.contactSince) badges.push({ key: "contactSince", label: `erster Kontakt ${formatDate(summary.contactSince)}`, title: "Erster Kontakt", icon: <CalendarDays size={13} /> });
    return badges;
  }

  if (summary.contactSince) badges.push({ key: "contactSince", label: `Seit ${formatDate(summary.contactSince)}`, title: "Kontakt seit", icon: <CalendarDays size={13} /> });
  if (summary.lastContactAt) badges.push({ key: "lastContactAt", label: `Zuletzt ${formatDate(summary.lastContactAt)}`, title: "Letzter Kontakt", icon: <Clock size={13} /> });
  if (stats.emailOutbound > 0) badges.push({ key: "emailOutbound", label: `${stats.emailOutbound} gesendet`, title: "E-Mail gesendet", icon: <Send size={13} /> });
  if (stats.emailInbound > 0) badges.push({ key: "emailInbound", label: `${stats.emailInbound} empfangen`, title: "E-Mail empfangen", icon: <Mail size={13} /> });
  if (stats.phone > 0) badges.push({ key: "phone", label: `${stats.phone} Telefon`, title: "Telefon", icon: <Phone size={13} /> });
  if (stats.meeting > 0) badges.push({ key: "meeting", label: `${stats.meeting} Meeting`, title: "Meeting", icon: <Users size={13} /> });
  if (stats.visit > 0) badges.push({ key: "visit", label: `${stats.visit} Besuch`, title: "Besuch", icon: <MapPin size={13} /> });
  if (stats.letters > 0) badges.push({ key: "letters", label: `${stats.letters} Brief`, title: "Brief", icon: <MessageSquareText size={13} /> });
  if (stats.measureTotal > 0) badges.push({ key: "measures", label: `${measureLabel(stats)}`, title: "Maßnahmen", icon: <CheckCircle2 size={13} /> });
  return badges;
}

function measureLabel(stats: PartyActivityStats): string {
  if (stats.openMeasureTotal > 0) return `${stats.openMeasureTotal}/${stats.measureTotal} offen`;
  return `${stats.measureTotal} Maßnahmen`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(date);
}

function formatTaskParticipantDueDate(value: string | null): string {
  if (!value) return "Nicht terminiert";
  const dueDate = dueCalendarDate(value);
  if (!dueDate) return value;
  const dayDelta = dayDeltaFromToday(dueDate);
  const weekday = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(dueDate.year, dueDate.month - 1, dueDate.day).getDay()];
  const dateLabel = `${String(dueDate.day).padStart(2, "0")}.${String(dueDate.month).padStart(2, "0")}.${String(dueDate.year).slice(-2)}`;
  const relativeLabel = dayDelta === 0
    ? "heute"
    : dayDelta > 0
      ? `in ${dayDelta} ${dayDelta === 1 ? "Tag" : "Tagen"}`
      : `vor ${Math.abs(dayDelta)} ${Math.abs(dayDelta) === 1 ? "Tag" : "Tagen"}`;
  return `${weekday}, ${dateLabel} · ${relativeLabel}`;
}

function taskDueTone(value: string | null): "future" | "today" | "past" | "unscheduled" {
  if (!value) return "unscheduled";
  const dueDate = dueCalendarDate(value);
  if (!dueDate) return "unscheduled";
  const dayDelta = dayDeltaFromToday(dueDate);
  if (dayDelta === 0) return "today";
  return dayDelta > 0 ? "future" : "past";
}

function dayDeltaFromToday(date: { year: number; month: number; day: number }): number {
  const now = new Date();
  return Math.round(
    (Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000
  );
}

function dueCalendarDate(value: string): { year: number; month: number; day: number } | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return { year, month, day };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  };
}

function taskStatusLabel(status: PartyNextAction["status"]): string {
  return status === "done" ? "Erledigt" : "Offen";
}
