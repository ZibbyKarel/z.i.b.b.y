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
 *
 * D6 (task 15): this used to join the WHOLE stack and string-compare it, so two
 * scenes with identical fonts in a different fallback order parked the run — and
 * a park here suppresses the pixel layer entirely, leaving the loop with no
 * progress signal for the rest of its five rounds. What decides a pixel is the
 * FIRST family the browser can resolve; the tail is what it would have used had
 * that failed, and it is never reached when the primary resolves on both sides.
 *
 * The rest of the stack is deliberately not compared AT ALL — not even at a
 * lower severity. Two reasons, and the second is the one that settles it:
 *
 * 1. `collectFontStacks` (cli.mjs) dedupes families into a Set in DOM-traversal
 *    order across the whole tree, so the tail's ORDER is a property of the walk,
 *    not of anyone's CSS. Reporting a difference computed from it would be the
 *    tool making a claim it cannot back — the one thing this branch forbids.
 * 2. Nothing is lost by dropping it. `fontFamily` is in `VALUE_PROPS`, so
 *    `compareValues` already compares the full declared stack string node by
 *    node, paired in lockstep, and any delta there keeps the round at "continue"
 *    — a real font difference is still reported, by the layer that can name the
 *    node it happened on. The preflight's job is only the coarse question the
 *    value layer cannot answer in time: is this comparison worth running at all.
 *
 * A genuine mismatch — a different primary family — still parks with pixels
 * suppressed. This narrows what counts as a mismatch; it does not remove the
 * check.
 *
 * Scope, stated because it is narrower than "the page's font" sounds (fix round
 * 1, M1): `collectFontStacks` walks the whole tree, so `design[0]` is the first
 * family of the first font-DECLARING node in DOM order — the root's primary
 * family in practice, not every family the tree uses. A heading font that
 * differs while the body font matches therefore passes here. That is deliberate
 * and it is not a hole in the verdict: `evaluateRound` returns "continue" on any
 * value delta before it ever looks at pixels, and `compareValues` compares
 * `fontFamily` per node — so such a difference still keeps the round going, it
 * simply no longer suppresses the pixel layer that gives the loop its progress
 * signal.
 */
export function fontPreflight(designFonts, appFonts) {
  const design = normalise(designFonts);
  const app = normalise(appFonts);
  // CSS font-family names are case-insensitive; comparing case-sensitively
  // would report "geist" vs "Geist" as a mismatch and stop a run that should
  // have proceeded. The messages below keep each side's original casing.
  const fold = (family) => (family === undefined ? "" : family.toLowerCase());
  const show = (family) => (family === undefined ? "žádná" : family);
  const [designPrimary] = design;
  const [appPrimary] = app;
  // Fix round 1, M4: two empty stacks satisfy the equality below and used to
  // report "font stack shodný v první rodině: žádná" — a match claimed over no
  // evidence at all. It stays a pass, because there is nothing to suppress and
  // no browser can reach it (`getComputedStyle` always yields a family), but it
  // must not pass itself off as a verified agreement.
  if (design.length === 0 && app.length === 0) {
    return {
      ok: true,
      message:
        "font stack se nepodařilo zjistit ani na jedné straně — preflight nic neověřil, porovnání pokračuje bez něj",
    };
  }
  if (fold(designPrimary) === fold(appPrimary)) {
    return {
      ok: true,
      // Scoped on purpose: "shodný" without this qualifier would read as a claim
      // about the whole stack, which is not what was compared.
      message: `font stack shodný v první rodině: ${show(designPrimary)} (porovnává se jen první vykreslovaná rodina; zbytek fallbacku řeší hodnotová vrstva)`,
    };
  }
  return {
    ok: false,
    message: `font stack se liší v první vykreslované rodině — design: ${show(designPrimary)}, implementace: ${show(appPrimary)} (celé stacky — design: [${design.join(", ")}], implementace: [${app.join(", ")}]). Sjednoť je dřív, než se začne porovnávat.`,
  };
}
