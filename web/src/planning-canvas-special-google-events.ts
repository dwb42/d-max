import type { CalendarViewEvent } from "./types.js";

export type PlanningCanvasSpecialGoogleEventKind = "childcare_bianka" | "childcare_dietrich";

export type PlanningCanvasSpecialGoogleEventMatch = {
  kind: PlanningCanvasSpecialGoogleEventKind;
  className: string;
  color: string;
  textColor: string;
  personLabel: string;
  priority: number;
};

type PlanningCanvasSpecialGoogleEventRule = {
  kind: PlanningCanvasSpecialGoogleEventKind;
  titlePattern: RegExp;
  className: string;
  color: string;
  textColor: string;
  personLabel: string;
  priority: number;
};

// Temporary title-based rules for family childcare planning. Keep this isolated
// so the matcher can later read tags, categories, event metadata, or persisted rules.
const planningCanvasSpecialGoogleEventRules: PlanningCanvasSpecialGoogleEventRule[] = [
  {
    kind: "childcare_bianka",
    titlePattern: /(?=.*bianka)(?=.*kinder)/iu,
    className: "childcare-bianka",
    color: "#c96f8f",
    textColor: "#ffffff",
    personLabel: "Bianka",
    priority: 1
  },
  {
    kind: "childcare_dietrich",
    titlePattern: /(?=.*dietrich)(?=.*kinder)/iu,
    className: "childcare-dietrich",
    color: "#3f6f8f",
    textColor: "#ffffff",
    personLabel: "Dietrich",
    priority: 2
  }
];

export function classifyPlanningCanvasSpecialGoogleEvent(
  event: Extract<CalendarViewEvent, { source: "google" }>
): PlanningCanvasSpecialGoogleEventMatch | null {
  const normalizedTitle = normalizeSpecialGoogleEventTitle(event.title);
  const rule = planningCanvasSpecialGoogleEventRules.find((candidate) => candidate.titlePattern.test(normalizedTitle));
  if (!rule) return null;
  return {
    kind: rule.kind,
    className: rule.className,
    color: rule.color,
    textColor: rule.textColor,
    personLabel: rule.personLabel,
    priority: rule.priority
  };
}

function normalizeSpecialGoogleEventTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLocaleLowerCase("de-DE");
}
