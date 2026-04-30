const MAX_TITLE_LENGTH = 72;

const LEADING_FILLERS = [
  /^okay[, ]+/i,
  /^ok[, ]+/i,
  /^gut[, ]+/i,
  /^also[, ]+/i,
  /^bitte\s+/i,
  /^kannst du(?: bitte)?\s+/i,
  /^könntest du(?: bitte)?\s+/i,
  /^ich möchte(?: gerne)?\s+/i,
  /^ich würde gerne\s+/i,
  /^ich will\s+/i
];

const WEAK_WORDS = new Set([
  "bitte",
  "kannst",
  "könntest",
  "du",
  "mir",
  "mich",
  "mal",
  "kurz",
  "hier",
  "dazu",
  "dann",
  "jetzt",
  "noch",
  "einmal",
  "machen"
]);

export function deriveConversationTitle(input: string): string {
  const cleaned = normalizeInput(input);
  if (!cleaned) {
    return "Neuer Chat";
  }

  const lower = cleaned.toLowerCase();
  if (/zugverbindungen?/.test(lower)) {
    return "Passende Zugverbindungen suchen";
  }

  if (/(s&p|smp)\s*500/.test(lower) && /portfolio/.test(lower)) {
    return "S&P-500-Portfolio aktualisieren";
  }

  if (/stan\s+(druckenmiller|drucken miller|dragon miller|dragonmiller|drachenmiller|rocken miller|rockenmiller)/.test(lower)) {
    return "Stan Druckenmiller folgen";
  }

  if (/(tasks?|aufgaben).*(sortier|umsortier|reihenfolge)|(?:sortier|umsortier).*(tasks?|aufgaben)/.test(lower)) {
    return "Tasks sinnvoll sortieren";
  }

  if (/(fasse|zusammenfass)/.test(lower) && /(projekt|task|kontext|dies)/.test(lower)) {
    return "Kontext zusammenfassen";
  }

  if (/(recherchier|suche|such)\b/.test(lower)) {
    return compactTitle(cleaned, "Recherche starten");
  }

  if (/(erstelle|anlegen|lege).*kategorie|kategorie.*(?:erstelle|anlegen|lege)/.test(lower)) {
    return "Kategorie und Projekt anlegen";
  }

  return compactTitle(cleaned, "Neuer Chat");
}

function normalizeInput(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/^[\s"']+|[\s"'.!?]+$/g, "")
    .trim();
}

function stripLeadingFiller(input: string): string {
  let stripped = input;
  for (const pattern of LEADING_FILLERS) {
    stripped = stripped.replace(pattern, "");
  }
  return stripped.trim();
}

function compactTitle(input: string, fallback: string): string {
  const stripped = stripLeadingFiller(input)
    .replace(/^[,;:\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = stripped
    .split(" ")
    .filter((word) => !WEAK_WORDS.has(word.toLowerCase().replace(/[^\p{L}\p{N}&]/gu, "")));

  const title = truncateAtWordBoundary(words.slice(0, 12).join(" ").replace(/[\s,;:.!?]+$/g, ""));
  return title ? capitalizeFirst(title) : fallback;
}

function truncateAtWordBoundary(input: string): string {
  if (input.length <= MAX_TITLE_LENGTH) {
    return input;
  }

  const truncated = input.slice(0, MAX_TITLE_LENGTH + 1);
  const boundary = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, boundary > 32 ? boundary : MAX_TITLE_LENGTH).trim()}...`;
}

function capitalizeFirst(input: string): string {
  return input.charAt(0).toLocaleUpperCase("de-DE") + input.slice(1);
}
