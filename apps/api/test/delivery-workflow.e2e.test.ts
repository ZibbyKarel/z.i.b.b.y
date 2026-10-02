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
 * a clean read already proves it validates; the assertions then pin the two gates the
 * phase wired in: the objective `verify` (loops to Kodér) and the subjective `review`
 * qualify gate (`gap` → Kodér via `to`, `drift` → Architekt via `driftTo`).
 */
describe("Production delivery workflow (e2e parse guard)", () => {
  it("validates and wires the objective verify + subjective qualify gates", async () => {
    const store = new WorkflowsStorageService(DATA_WORKFLOWS_DIR);
    const delivery = await store.get("delivery");

    // Objective gate: a deterministic verify phase that loops failures back to Kodér.
    const verify = delivery.phases.find((p) => p.id === "verify");
    expect(verify?.type).toBe("verify");
    expect(verify?.loop?.to).toBe("koder");

    // Subjective gate: review is a qualify phase; gap → Kodér (to), drift → Architekt.
    const review = delivery.phases.find((p) => p.id === "review");
    expect(review?.qualify).toBe(true);
    expect(review?.loop?.to).toBe("koder");
    expect(review?.loop?.driftTo).toBe("architekt");
  });
});
