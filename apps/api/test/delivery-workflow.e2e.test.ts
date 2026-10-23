import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WorkflowsStorageService } from "../src/workflows/workflows.storage.service";

/** The committed production workflows dir (not the per-suite temp data dir). */
const DATA_WORKFLOWS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data-test/workflows",
);

/**
 * Phase 45 — guard the production delivery workflow DATA FILE against drift. Loaded
 * through the real store/parser (a corrupt or schema-invalid file throws on read), so
 * a clean read already proves it validates; the assertions then pin the `review`
 * qualify gate (`gap` → Kodér via `to`, `drift` → Architekt via `driftTo`) and that no
 * ZIBBY-side verify phase is back (the target repo verifies itself, D-024).
 */
describe("Production delivery workflow (e2e parse guard)", () => {
  it("validates and wires the qualify gates (no verify phase)", async () => {
    const store = new WorkflowsStorageService(DATA_WORKFLOWS_DIR);
    const delivery = await store.get("delivery");

    // No ZIBBY-side verify phase: the repo verifies itself (D-024).
    expect(delivery.phases.some((p) => p.id === "verify")).toBe(false);

    // Subjective gate: review is a qualify phase; gap → Kodér (to), drift → Architekt.
    const review = delivery.phases.find((p) => p.id === "review");
    expect(review?.qualify).toBe(true);
    expect(review?.loop?.to).toBe("koder");
    expect(review?.loop?.driftTo).toBe("architekt");
  });
});
