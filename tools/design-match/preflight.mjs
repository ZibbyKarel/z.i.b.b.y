// `next/font/google` never emits the plain family name a design mockup does —
// it emits a generated `__<name>_<hash>` (and, for the metric-matched
// fallback, `__<name>_Fallback_<hash>`). The shape is anchored (leading
// double underscore, trailing hex run) so it can only fire on the generated
// form, never on a family name that merely happens to contain an underscore.
const GENERATED_FONT_RE = /^__(.+)_[0-9a-f]+$/;

/**
 * Strips quotes/whitespace, then — only for the `next/font/google` generated
 * shape — recovers the plain family name. The synthetic `_Fallback` variant
 * has no counterpart on the design side (it's Next's own metric-matched
 * substitute, not a font either side actually renders in), so it is dropped
 * entirely rather than compared: keeping it would guarantee a mismatch no
 * code change can fix.
 */
function normaliseFontEntry(raw) {
  const trimmed = raw.replace(/["']/g, "").trim();
  const generated = GENERATED_FONT_RE.exec(trimmed);
  if (!generated) return trimmed;
  const name = generated[1];
  return name.endsWith("_Fallback") ? null : name;
}

const normalise = (families) => families.map(normaliseFontEntry).filter(Boolean);

/**
 * Stops the loop in F1 rather than in round five. A font mismatch makes every
 * later pixel delta a lie: the numbers move, but the cause is not in the code.
 */
export function fontPreflight(designFonts, appFonts) {
  const design = normalise(designFonts);
  const app = normalise(appFonts);
  // CSS font-family names are case-insensitive; comparing case-sensitively
  // would report "geist" vs "Geist" as a mismatch and stop a run that should
  // have proceeded. The messages below keep each side's original casing.
  const fold = (families) => families.map((f) => f.toLowerCase()).join(", ");
  if (fold(design) === fold(app)) {
    return { ok: true, message: `font stack shodný: ${design.join(", ")}` };
  }
  return {
    ok: false,
    message: `font stack se liší — design: [${design.join(", ")}], implementace: [${app.join(", ")}]. Sjednoť je dřív, než se začne porovnávat.`,
  };
}
