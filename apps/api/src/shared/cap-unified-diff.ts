/** Cap on the unified diff we ship to the browser (GitHub also refuses bigger ones). */
// ponytail: the whole text is held in memory before the cap is applied and the cap counts
// UTF-16 chars, not bytes; upgrade = per-file collapse/virtualization in FileDiffView.
export const MAX_DIFF_BYTES = 500_000;

/** Cut an oversized unified diff at the last whole-file boundary (else hard-cut at `max`). */
export function capUnifiedDiff(
  text: string,
  max = MAX_DIFF_BYTES,
): { diff: string; truncated: boolean } {
  if (text.length <= max) return { diff: text, truncated: false };
  const nl = text.lastIndexOf("\ndiff --git", max - 1); // line-anchored: not "+diff --git" in a hunk
  const cut = nl >= 0 ? nl + 1 : -1;
  return { diff: text.slice(0, cut > 0 ? cut : max), truncated: true };
}
