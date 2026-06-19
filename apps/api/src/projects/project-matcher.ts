import type { Project } from "@zibby/contracts";

/** The text/paths a task carries that attribution keys on. */
export interface MatchProjectInput {
  text?: string;
  paths?: string[];
}

/**
 * Deterministically attribute a task to one engagement (Phase 8.1) — index-first,
 * NO claude pass. Budget enforcement must be token-free and reproducible, so the
 * classifier never learns project vocabulary; this pure function does the routing:
 *
 *   (a) a `paths[]` entry that lives under a project's `path` wins (longest-prefix
 *       — the most specific project containing the file);
 *   (b) else a whole-word match of a project `id` or `name` in `text` (longest name
 *       wins ties), diacritics-insensitive so Czech names match unaccented text;
 *   (c) else `null` — unattributed (never queues, no per-project budget).
 *
 * Attribution is read-only classification (Law 4): the output is a label that drives
 * budget/queue/briefing/triage, never a privilege. A crafted message naming a
 * project gains nothing but its own grouping.
 */
export function matchProject(projects: Project[], input: MatchProjectInput): Project | null {
  return matchByPath(projects, input.paths) ?? matchByText(projects, input.text) ?? null;
}

/** Longest project `path` that contains one of the given file paths. */
function matchByPath(projects: Project[], paths?: string[]): Project | null {
  if (!paths || paths.length === 0) return null;
  let best: Project | null = null;
  let bestLen = -1;
  for (const project of projects) {
    const base = normalizePath(project.path);
    if (base.length === 0) continue;
    for (const raw of paths) {
      const candidate = normalizePath(raw);
      if (isUnder(candidate, base) && base.length > bestLen) {
        best = project;
        bestLen = base.length;
      }
    }
  }
  return best;
}

/** Whole-word match of a project id or name in the text; longest name wins ties. */
function matchByText(projects: Project[], text?: string): Project | null {
  if (!text || text.trim().length === 0) return null;
  const haystack = fold(text);
  let best: Project | null = null;
  let bestLen = -1;
  for (const project of projects) {
    for (const needle of [project.name, project.id]) {
      const folded = fold(needle);
      if (folded.length === 0) continue;
      if (containsWord(haystack, folded) && folded.length > bestLen) {
        best = project;
        bestLen = folded.length;
      }
    }
  }
  return best;
}

/** Normalize a path for prefix comparison: trim, strip a trailing slash. */
function normalizePath(p: string): string {
  const trimmed = p.trim().replace(/\/+$/, "");
  return trimmed;
}

/** True when `candidate` equals `base` or sits below it on a path-segment boundary. */
function isUnder(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}/`);
}

/** Lowercase + strip diacritics so "Síť" matches "sit" (Czech names vs ASCII text). */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * True when `needle` appears in `haystack` on whole-word boundaries — "web" must
 * not match inside "webapp". Word chars are letters/digits/`_`/`-`; anything else
 * (or a string edge) is a boundary. Both args are already folded.
 */
function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : haystack[at - 1]!;
    const after = at + needle.length >= haystack.length ? "" : haystack[at + needle.length]!;
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

function isWordChar(ch: string): boolean {
  return ch.length > 0 && /[a-z0-9_-]/.test(ch);
}
