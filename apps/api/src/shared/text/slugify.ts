/**
 * Deterministically turn a free-form name into a filename/id-safe slug: strip
 * diacritics, lowercase, collapse anything that isn't a letter or digit into a
 * single `-`, trim leading/trailing dashes. Used by the person-id backfill
 * (Phase 69) to derive a stable id from a person's `name` when one is missing;
 * an empty result (e.g. a name that is all punctuation) falls back to
 * `"person"` so callers always get a non-empty, usable slug.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "person";
}
