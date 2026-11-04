import type { HighlightRange, HighlightTone } from "@zibby/design-system";

/** The trigger table: `@` = who runs it (agent/department/workflow), `#` =
 * what it can see (company/team/project), `/` = which skill it uses. */
export type Trigger = "@" | "#" | "/";

/** Every trigger — the read-only renderers (a sent chat turn, a task brief) mark all. */
export const ALL_TRIGGERS: ReadonlySet<Trigger> = new Set<Trigger>(["@", "#", "/"]);

/** A name a trigger token can resolve to, with the highlight tone it renders in. */
export interface KnownName {
  trigger: Trigger;
  name: string;
  tone: HighlightTone;
}

const TRIGGER_START_RE = /(^|\s)([@#/])/g;
export const NAME_CHAR_RE = /[\p{L}\p{N}_-]/u;
const TOKEN_RE = /\S*/y;

/** Every trigger token in `text` as one range. A known name matches case-insensitively,
 *  longest first, so a multi-word name ("@Coloring Book") is ONE range and wins over a
 *  shorter prefix ("@Coloring"). An unknown `@token` (a dropped file, an unresolved name)
 *  still renders `dim` up to the next whitespace; unknown `#`/`/` tokens are not marked. */
export function mentionRanges(
  text: string,
  known: readonly KnownName[],
  enabled: ReadonlySet<Trigger>,
): HighlightRange[] {
  const sorted = [...known].sort((a, b) => b.name.length - a.name.length);
  const lower = text.toLowerCase();
  const ranges: HighlightRange[] = [];
  let lastEnd = 0;
  for (const match of text.matchAll(TRIGGER_START_RE)) {
    const i = (match.index ?? 0) + (match[1]?.length ?? 0);
    const trigger = match[2] as Trigger;
    // A trigger swallowed by the previous (multi-word) range is not a new token.
    if (i < lastEnd || !enabled.has(trigger)) continue;
    const hit = sorted.find(
      (k) =>
        k.trigger === trigger &&
        lower.startsWith(k.name.toLowerCase(), i + 1) &&
        !NAME_CHAR_RE.test(text.charAt(i + 1 + k.name.length)),
    );
    if (hit) {
      ranges.push({ start: i, end: i + 1 + hit.name.length, tone: hit.tone });
    } else if (trigger === "@") {
      TOKEN_RE.lastIndex = i + 1;
      const len = TOKEN_RE.exec(text)?.[0].length ?? 0;
      if (len === 0) continue;
      ranges.push({ start: i, end: i + 1 + len, tone: "dim" });
    } else {
      continue;
    }
    lastEnd = ranges[ranges.length - 1]?.end ?? lastEnd;
  }
  return ranges;
}
