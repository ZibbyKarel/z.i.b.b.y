/** Options for {@link slug}. A bare string is accepted as shorthand for `fallback`. */
export interface SlugOptions {
  /** Returned when nothing survives normalization (default `""`). */
  fallback?: string;
  /** Hard cap on the result length (applied after trimming edge dashes). */
  maxLength?: number;
}

/**
 * Slugify a free-form name into a filesystem-safe id: lowercased, diacritics
 * stripped ("Nový" → "novy"), non-alphanumerics collapsed to single dashes.
 * Returns `fallback` (default "") when nothing survives — pass e.g. "novy"
 * where an id must never be empty. Pass `{ maxLength }` to cap the id length
 * (callers that append a uniqueness suffix leave room with this).
 *
 * This is the single slug implementation for the app; the API mirrors the same
 * normalization in its `*IdSchema`s, so previews match the persisted id.
 */
export const slug = (value: string, options: string | SlugOptions = {}): string => {
  const { fallback = "", maxLength } = typeof options === "string" ? { fallback: options } : options;
  const out = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return (maxLength != null ? out.slice(0, maxLength) : out) || fallback;
};
