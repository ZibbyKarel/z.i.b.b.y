/** Title-cases a single path segment: `"acme-corp"` → `"Acme Corp"`,
 *  `"general"` → `"General"`. Dashes/underscores become spaces; everything
 *  else is left alone (ids/slugs humanize fine as-is). */
function humanizeSegment(segment: string): string {
  return segment
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * The `PinPageDialog`'s "last meaningful path segment(s) humanized" fallback
 * default (spec decision 1) — used when the caller has no live entity name/
 * crumb to prefill with (`SubnavPinButton` passes the resolved entity name
 * instead and never needs this). Falls back to the bare href when the path
 * has no segments to humanize (e.g. `"/"`).
 */
export function defaultPinLabelFor(href: string): string {
  const pathname = href.split("?")[0] ?? href;
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return href;
  const humanized = humanizeSegment(last);
  return humanized || href;
}
