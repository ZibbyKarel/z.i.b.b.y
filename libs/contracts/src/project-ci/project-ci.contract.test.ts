import { describe, expect, it } from "vitest";
import { BridgeWidgetSchema } from "../system/system.schema";
import { projectCiContract } from "./project-ci.contract";
import { ProjectCiSchema } from "./project-ci.schema";

describe("projectCiContract", () => {
  it("routes get + fix under /api/project-ci", () => {
    expect(projectCiContract.getProjectCi.path).toBe("/api/project-ci/:projectId");
    expect(projectCiContract.fixProjectCi.path).toBe("/api/project-ci/:projectId/fix");
  });

  it("parses a red base branch with a failed step", () => {
    const ci = ProjectCiSchema.parse({
      projectId: "acme",
      provider: "github",
      repoUrl: "https://github.com/acme/web",
      branch: "main",
      state: "failing",
      workflows: [
        {
          id: 1,
          name: "CI",
          state: "failing",
          jobs: [
            {
              id: 2,
              name: "test",
              state: "failing",
              steps: [{ number: 3, name: "Run tests", state: "failing" }],
            },
          ],
        },
      ],
      checkedAt: "2026-11-12T10:00:00.000Z",
    });
    expect(ci.workflows[0]?.jobs[0]?.steps[0]?.state).toBe("failing");
  });
});

describe("BridgeWidgetSchema — projectStatus", () => {
  it("accepts the type with a project scope", () => {
    const w = BridgeWidgetSchema.parse({
      id: "projectStatus",
      type: "projectStatus",
      x: 0,
      y: 0,
      w: 4,
      h: 4,
      scope: { projectIds: ["acme", "zibby"] },
    });
    expect(w.scope?.projectIds).toEqual(["acme", "zibby"]);
  });
});
