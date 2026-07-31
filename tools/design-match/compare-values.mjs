/**
 * Value layer — only ever consulted once the skeleton gate has passed, so a
 * delta here is always "right structure, wrong number" and directly actionable.
 */
export function compareValues(design, app) {
  const deltas = [];
  for (const [path, props] of Object.entries(design)) {
    const appProps = app[path];
    if (!appProps) {
      deltas.push({
        path,
        prop: "__missing__",
        expected: "node exists",
        actual: "chybí",
        message: `${path}: uzel v implementaci chybí`,
      });
      continue;
    }
    for (const [prop, expected] of Object.entries(props)) {
      const actual = appProps[prop];
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
  }
  return deltas;
}
