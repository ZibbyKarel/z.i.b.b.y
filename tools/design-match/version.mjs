/**
 * Bumped when the measurement format changes in a way that invalidates cached specs.
 *
 * 1.4.0 (fix round 1, I3): `spec.json` gained `settled` — whether the mockup had
 * finished loading when `design.png` was photographed. A spec written by 1.3.0
 * cannot answer that question, and a `compare` that reads one would have to
 * either stay silent about the design side (claiming nothing, but also hiding a
 * caveat that may well apply) or invent an answer. Re-measuring produces the
 * fact; that is worth one forced re-measure.
 */
export const DESIGN_MATCH_VERSION = "1.4.0";
