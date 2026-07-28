/**
 * The one function that decides what a re-sync is allowed to do to
 * `RoadmapItem.dependsOn` (125b — see `docs/api/roadmap.md`'s "Ownership split
 * on re-sync"). `dependsOn` is the UNION of edges the source declares
 * (`dependsOnFromSource`) and edges the operator adds by hand directly on
 * `dependsOn`. A re-sync must:
 *
 *  - drop a source edge the source no longer declares (it removed a `blocks`/
 *    `Depends on #N` link upstream), and
 *  - pick up a source edge the source newly declares, while
 *  - NEVER touching a manual edge — one that was never in the PREVIOUS sync's
 *    `dependsOnFromSource` at all.
 *
 * Pure and separately unit-tested on purpose: this is the one place a bug
 * silently loses an operator's manually-added dependency, so it must not be
 * buried inside the upsert's imperative read-modify-write.
 *
 * `kept` preserves `current`'s own order (manual edges, plus any source edge
 * that is unchanged between `oldFromSource` and `newFromSource`); `added`
 * appends any brand-new source edge not already present, also in
 * `newFromSource`'s order. Every id is deduplicated by `Set` membership.
 */
export function mergeDependsOn(
  current: readonly string[],
  oldFromSource: readonly string[],
  newFromSource: readonly string[],
): string[] {
  const oldSet = new Set(oldFromSource);
  const newSet = new Set(newFromSource);

  // Keep every edge that either (a) was never source-owned (a manual edge —
  // not in `oldFromSource`), or (b) was source-owned AND the source still
  // declares it (present in `newFromSource`). Drop only a source edge the
  // source has since removed.
  const kept = current.filter((id) => !oldSet.has(id) || newSet.has(id));

  const keptSet = new Set(kept);
  const added = newFromSource.filter((id) => !keptSet.has(id));

  return [...kept, ...added];
}
