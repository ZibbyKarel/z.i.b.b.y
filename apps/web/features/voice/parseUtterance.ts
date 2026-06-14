/**
 * The closed set of things a spoken utterance can become. Anything the grammar
 * does not recognise as a command falls through to {@link VoiceCreateTask} — a
 * spoken word is never a silent no-op (the same rule typed tasks follow).
 */
export type VoiceAction =
  | { kind: "approveLatest" }
  | { kind: "rejectLatest" }
  | { kind: "stopActive" }
  | { kind: "closeOverlay" }
  | { kind: "navigate"; route: string; page: NavPage }
  | { kind: "createTask"; text: string };

/** Dashboard segments the voice grammar can jump to. */
export type NavPage =
  | "overview"
  | "runs"
  | "agents"
  | "pipelines"
  | "projects"
  | "memory"
  | "integrations"
  | "automations"
  | "gates"
  | "skills"
  | "settings";

/**
 * Normalize for diacritics-insensitive matching: lowercase, decompose accents
 * (NFD) and drop the combining marks, replace punctuation with spaces, collapse
 * runs of whitespace. `"Otevři Běhy!"` → `"otevri behy"`. The raw utterance is
 * kept separately so the task text retains its diacritics.
 */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Command verbs, already normalized (no diacritics). Matched as the FIRST word of
// a concise utterance so a dictated task ("approve the budget for Q3") is not
// hijacked into a gate decision.
const APPROVE = new Set([
  "schvalit",
  "schvaluji",
  "schval",
  "schvaleno",
  "potvrd",
  "potvrdit",
  "potvrzuji",
  "approve",
  "approved",
  "confirm",
  "accept",
]);
const REJECT = new Set([
  "odmitnout",
  "odmitni",
  "odmit",
  "zamitnout",
  "zamitni",
  "zamitnuto",
  "reject",
  "deny",
  "decline",
  "zrus",
  "zrusit",
]);
const STOP = new Set(["zastav", "zastavit", "zastavte", "stop", "halt"]);
const CLOSE = new Set([
  "zavri",
  "zavrit",
  "zavrete",
  "konec",
  "close",
  "exit",
  "dismiss",
  "hud",
]);

/** Max words for a bare command — keeps "approve" / "stop the agent" in, dictation out. */
const MAX_COMMAND_WORDS = 3;

// Navigate verbs (normalized), longest first so multi-word prefixes win.
const NAV_VERBS = [
  "navigate to",
  "go to",
  "show me",
  "jdi na",
  "prejdi na",
  "prejdi",
  "otevri",
  "otevrit",
  "zobraz",
  "zobrazit",
  "show",
  "open",
];

// Page aliases (normalized) → route. cs + en, including a couple of natural synonyms.
const NAV_ALIASES: Record<string, NavPage> = {
  prehled: "overview",
  overview: "overview",
  dashboard: "overview",
  domu: "overview",
  home: "overview",
  behy: "runs",
  beh: "runs",
  runs: "runs",
  orchestrace: "runs",
  agenti: "agents",
  agent: "agents",
  agents: "agents",
  pipeliny: "pipelines",
  pipeline: "pipelines",
  pipelines: "pipelines",
  projekty: "projects",
  projekt: "projects",
  projects: "projects",
  pamet: "memory",
  memory: "memory",
  vault: "memory",
  integrace: "integrations",
  integrations: "integrations",
  kanaly: "integrations",
  channels: "integrations",
  automatizace: "automations",
  automations: "automations",
  brany: "gates",
  gates: "gates",
  schvalovani: "gates",
  approvals: "gates",
  skilly: "skills",
  skills: "skills",
  dovednosti: "skills",
  nastaveni: "settings",
  settings: "settings",
};

function matchNavigate(norm: string): VoiceAction | null {
  for (const verb of NAV_VERBS) {
    if (norm === verb) continue; // verb with no target
    if (norm.startsWith(`${verb} `)) {
      const rest = norm.slice(verb.length).trim();
      const page = NAV_ALIASES[rest];
      if (page) return { kind: "navigate", route: `/${page}`, page };
    }
  }
  return null;
}

/**
 * Turn a spoken utterance into a {@link VoiceAction}. Pure and synchronous —
 * the dispatch hook owns the side effects. Navigation is tried first (it has its
 * own verb + target shape), then the concise bare commands, then everything else
 * becomes a task carrying the **raw** (diacritics-intact) text.
 */
export function parseUtterance(raw: string): VoiceAction {
  const text = raw.trim();
  if (!text) return { kind: "createTask", text: "" };

  const norm = normalize(text);
  if (!norm) return { kind: "createTask", text };

  const nav = matchNavigate(norm);
  if (nav) return nav;

  const words = norm.split(" ");
  if (words.length <= MAX_COMMAND_WORDS) {
    const head = words[0] ?? "";
    if (APPROVE.has(head)) return { kind: "approveLatest" };
    if (REJECT.has(head)) return { kind: "rejectLatest" };
    if (STOP.has(head)) return { kind: "stopActive" };
    if (CLOSE.has(head)) return { kind: "closeOverlay" };
  }

  return { kind: "createTask", text };
}
