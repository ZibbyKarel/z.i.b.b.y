const normalise = (families) => families.map((f) => f.replace(/["']/g, "").trim()).filter(Boolean);

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
