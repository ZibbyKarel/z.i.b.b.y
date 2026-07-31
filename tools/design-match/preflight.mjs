const normalise = (families) => families.map((f) => f.replace(/["']/g, "").trim()).filter(Boolean);

/**
 * Stops the loop in F1 rather than in round five. A font mismatch makes every
 * later pixel delta a lie: the numbers move, but the cause is not in the code.
 */
export function fontPreflight(designFonts, appFonts) {
  const design = normalise(designFonts);
  const app = normalise(appFonts);
  if (design.join(", ") === app.join(", ")) {
    return { ok: true, message: `font stack shodný: ${design.join(", ")}` };
  }
  return {
    ok: false,
    message: `font stack se liší — design: [${design.join(", ")}], implementace: [${app.join(", ")}]. Sjednoť je dřív, než se začne porovnávat.`,
  };
}
