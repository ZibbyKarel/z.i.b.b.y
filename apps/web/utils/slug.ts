/**
 * Slugify a free-form name into a filesystem-safe id: lowercased, diacritics
 * stripped ("Nový" → "novy"), non-alphanumerics collapsed to single dashes.
 * Returns `fallback` (default "") when nothing survives — pass e.g. "novy"
 * where an id must never be empty.
 */
export const slug = (value: string, fallback = ""): string => {
  const out = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return out || fallback;
};
