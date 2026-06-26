import { describe, expect, it } from "vitest";
import { buildStageTask } from "./build-stage-task";

describe("buildStageTask", () => {
  it("includes consume/produce lines and no verdict instruction on a non-qualify phase", () => {
    const task = buildStageTask({
      phaseId: "koder",
      consumesAbs: "/run/koder/plan.md",
      producesAbs: "/run/koder/impl.md",
    });
    expect(task).toContain('Proveď fázi pipeline "koder".');
    expect(task).toContain('Vstup (pokud existuje) najdeš v "/run/koder/plan.md".');
    expect(task).toContain('Výstup zapiš do "/run/koder/impl.md".');
    expect(task).not.toContain("<verdict>");
  });

  it("omits the consume/produce lines when those paths are absent", () => {
    const task = buildStageTask({ phaseId: "x", consumesAbs: null, producesAbs: null });
    expect(task).toBe('Proveď fázi pipeline "x".');
  });

  it("adds all three verdict tokens and the anti-rationalization clause on a qualify phase", () => {
    const task = buildStageTask({
      phaseId: "review",
      consumesAbs: "/run/review/impl.md",
      producesAbs: "/run/review/review.md",
      qualify: true,
    });
    expect(task).toContain("<verdict>pass</verdict>");
    expect(task).toContain("<verdict>gap</verdict>");
    expect(task).toContain("<verdict>drift</verdict>");
    expect(task).toContain("nejsou pass");
    expect(task).toContain("Bez tagu");
  });
});
