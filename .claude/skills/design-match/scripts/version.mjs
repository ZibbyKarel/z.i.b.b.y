/**
 * Bumped when the measurement format changes in a way that invalidates cached specs.
 *
 * 1.5.0 (task 20, I4): `spec.tokenMappings` gained a third state. A 1.4.0 spec
 * writes `[]` both when the theme WAS read and nothing needed a new token and
 * when the theme file could not be read at all; 1.5.0 writes `null` (plus
 * `themeError`) for the second. Reading a 1.4.0 spec under the new meaning would
 * present "the theme was never opened" as "no new tokens needed" — and new
 * tokens are an approval gate SKILL.md asks the operator to trust. The fact is
 * unrecoverable from the old document, so it has to be re-measured.
 *
 * 1.4.0 (fix round 1, I3): `spec.json` gained `settled` — whether the mockup had
 * finished loading when `design.png` was photographed. A spec written by 1.3.0
 * cannot answer that question, and a `compare` that reads one would have to
 * either stay silent about the design side (claiming nothing, but also hiding a
 * caveat that may well apply) or invent an answer. Re-measuring produces the
 * fact; that is worth one forced re-measure.
 */
export const DESIGN_MATCH_VERSION = "1.5.0";
