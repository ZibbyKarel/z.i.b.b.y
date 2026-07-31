/**
 * Value layer — only ever consulted once the skeleton gate has passed, so a
 * delta here is always "right structure, wrong number" and directly actionable.
 *
 * That invariant is structural, not a hope: both sides are the SAME normalised
 * tree the gate compared, walked in lockstep and paired by position, and every
 * delta is keyed by the design side's skeleton path. There is no lookup that
 * can miss, so there is no "this node does not exist in the implementation"
 * delta to report — a reader moving between `skeleton.md` and `values.md`
 * finds the same path naming the same node.
 */
import { childPath, rootPath } from "./normalize.mjs";

function walk(design, app, path, deltas) {
  // The gate has already proven the two trees pair. If they don't, the gate is
  // broken — say so, loudly, instead of dressing a structural failure up as a
  // value difference and sending the coding agent after the wrong thing.
  if (design.children.length !== app.children.length) {
    throw new Error(
      `design-match: skeleton gate propustil strom, který neodpovídá — ${path} má ${design.children.length} potomků v designu a ${app.children.length} v implementaci; je to chyba v gate, ne hodnotový rozdíl`,
    );
  }

  for (const [prop, expected] of Object.entries(design.values)) {
    const actual = app.values[prop];
    if (actual !== expected) {
      deltas.push({
        path,
        prop,
        expected,
        actual,
        message: `${path}: ${prop} ${expected} vs ${actual}`,
      });
    }
  }

  design.children.forEach((designChild, index) => {
    walk(designChild, app.children[index], childPath(path, designChild, index), deltas);
  });
}

export function compareValues(designSkeleton, appSkeleton) {
  const deltas = [];
  walk(designSkeleton, appSkeleton, rootPath(designSkeleton), deltas);
  return deltas;
}
