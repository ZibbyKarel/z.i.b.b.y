import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATION_MARKER, migrateWorkflowRename } from "./workflow-rename";

let root: string;

const write = async (rel: string, body: string): Promise<void> => {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body, "utf8");
};
const read = (rel: string): Promise<string> => fs.readFile(path.join(root, rel), "utf8");
const readJson = async (rel: string): Promise<Record<string, unknown>> =>
  JSON.parse(await read(rel)) as Record<string, unknown>;
const exists = (rel: string): Promise<boolean> =>
  fs.access(path.join(root, rel)).then(
    () => true,
    () => false,
  );

const DEFINITION = `---
name: Delivery
phases:
  - id: plan
    type: agent
    agent: architekt
  - id: sub
    type: pipeline
    pipeline: research
    consumes: in.md
    produces: out.md
---
Body prose: run the pipeline (type: pipeline stays in free text).
`;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "wf-rename-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("migrateWorkflowRename", () => {
  it("moves the dir, renames definitions and rewrites only the known keys/values", async () => {
    await write("pipelines/delivery.pipeline.md", DEFINITION);
    await write("pipelines/assets/logo.txt", "asset");
    // run aggregate (pretty-printed) + stage sidecar + a nested workspace json that must stay
    await write(
      "pipelines/runs/delivery_1/run.json",
      JSON.stringify(
        {
          pipelineRunId: "delivery_1",
          pipelineId: "delivery",
          status: "done",
          summary: "pipeline delivery finished",
        },
        null,
        2,
      ),
    );
    await write(
      "pipelines/runs/delivery_1/plan/package.json",
      JSON.stringify({ pipelineId: "do-not-touch" }),
    );
    await write(
      "pipelines/runs/delivery_1.plan_2.json",
      JSON.stringify({ runId: "x", kind: "pipeline-stage", pipelineRunId: "delivery_1" }),
    );
    // task, approval (stringified detail), automation, goal, pins, activity-view
    await write(
      "tasks/t1.json",
      JSON.stringify({ title: "run the pipeline", target: { kind: "pipeline", id: "delivery" } }),
    );
    await write(
      "approvals/a1.json",
      JSON.stringify({
        id: "a1",
        runId: "delivery_1",
        detail: JSON.stringify({ riskType: "push", actorKind: "pipeline" }),
      }),
    );
    await write(
      "automations/au.json",
      JSON.stringify({ target: { type: "pipeline", pipelineId: "research" } }),
    );
    await write(
      "goals/g.goal.md",
      "---\nname: g\nmaker:\n  kind: pipeline\n  id: delivery\n---\nGoal about a pipeline.\n",
    );
    await write("pins.json", JSON.stringify([{ kind: "pipeline", id: "delivery" }]));
    await write("activity-view.json", JSON.stringify({ runs: "visible", pipelines: "hidden" }));
    // activity log + budget ledger (jsonl): one rewritten line, one free-text line kept verbatim
    await write(
      "activity/2026-10-02.jsonl",
      [
        JSON.stringify({ kind: "pipeline-started", refs: { pipelineId: "delivery" } }),
        "not json — pipeline note",
        JSON.stringify({ kind: "run-started", summary: "pipeline x" }),
      ].join("\n") + "\n",
    );
    await write("budget-ledger/2026-10.jsonl", JSON.stringify({ targetKind: "pipeline" }) + "\n");
    // untouchable zones
    await write("roadmap/item.json", JSON.stringify({ kind: "pipeline", pipelineId: "x" }));
    await write(
      "vault/knowledge/self-knowledge.md",
      "<!-- AUTO:PIPELINES:START -->\nx\n<!-- AUTO:PIPELINES:END -->\n",
    );

    const res = await migrateWorkflowRename(root);
    expect(res.skipped).toBe(false);

    // dir + file renames
    expect(await exists("pipelines")).toBe(false);
    expect(await exists("workflows/assets/logo.txt")).toBe(true);
    expect(await exists("workflows/delivery.pipeline.md")).toBe(false);
    const def = await read("workflows/delivery.workflow.md");
    expect(def).toContain("    type: workflow\n    workflow: research\n");
    expect(def).toContain("type: agent");
    expect(def).toContain("run the pipeline (type: pipeline stays in free text)");

    // run aggregate: keys renamed, free text and formatting kept
    const run = await read("workflows/runs/delivery_1/run.json");
    expect(JSON.parse(run)).toEqual({
      workflowRunId: "delivery_1",
      workflowId: "delivery",
      status: "done",
      summary: "pipeline delivery finished",
    });
    expect(run).toContain('\n  "workflowRunId"');
    expect(await read("workflows/runs/delivery_1/plan/package.json")).toContain("pipelineId");
    expect(await readJson("workflows/runs/delivery_1.plan_2.json")).toMatchObject({
      kind: "workflow-stage",
      workflowRunId: "delivery_1",
    });

    expect(await readJson("tasks/t1.json")).toEqual({
      title: "run the pipeline",
      target: { kind: "workflow", id: "delivery" },
    });
    const approval = await readJson("approvals/a1.json");
    expect(JSON.parse(String(approval.detail))).toEqual({
      riskType: "push",
      actorKind: "workflow",
    });
    expect(await readJson("automations/au.json")).toEqual({
      target: { type: "workflow", workflowId: "research" },
    });
    expect(await read("goals/g.goal.md")).toContain("maker:\n  kind: workflow\n");
    expect(await read("goals/g.goal.md")).toContain("Goal about a pipeline.");
    expect(await readJson("pins.json")).toEqual([{ kind: "workflow", id: "delivery" }] as never);
    expect(await readJson("activity-view.json")).toEqual({ runs: "visible", workflows: "hidden" });

    const lines = (await read("activity/2026-10-02.jsonl")).split("\n");
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      kind: "workflow-started",
      refs: { workflowId: "delivery" },
    });
    expect(lines[1]).toBe("not json — pipeline note");
    expect(JSON.parse(lines[2] ?? "")).toEqual({ kind: "run-started", summary: "pipeline x" });
    expect(await read("budget-ledger/2026-10.jsonl")).toBe('{"targetKind":"workflow"}\n');

    // untouched zones
    expect(await read("roadmap/item.json")).toContain('"pipelineId"');
    expect(await read("vault/knowledge/self-knowledge.md")).toContain("AUTO:WORKFLOWS:START");
    expect(await exists(MIGRATION_MARKER)).toBe(true);
  });

  it("is idempotent: a second run is a no-op, and a marker-less re-run changes nothing", async () => {
    await write("pipelines/a.pipeline.md", DEFINITION);
    await write("tasks/t.json", JSON.stringify({ target: { kind: "pipeline", id: "a" } }));
    await migrateWorkflowRename(root);
    const snapshot = await read("tasks/t.json");

    expect((await migrateWorkflowRename(root)).skipped).toBe(true);

    await fs.rm(path.join(root, MIGRATION_MARKER)); // simulate an interrupted first run
    const again = await migrateWorkflowRename(root);
    expect(again).toMatchObject({ skipped: false, rewritten: 0, moved: 0 });
    expect(await read("tasks/t.json")).toBe(snapshot);
  });

  it("merges a stray old dir into an existing workflows/ without overwriting", async () => {
    await write("workflows/keep.workflow.md", "new");
    await write("pipelines/keep.pipeline.md", "old");
    await write("pipelines/runs/r1/run.json", "{}");
    await migrateWorkflowRename(root);
    expect(await read("workflows/keep.workflow.md")).toBe("new");
    expect(await exists("workflows/runs/r1/run.json")).toBe(true);
    expect(await exists("workflows/keep.pipeline.md")).toBe(true); // the shadowed old file is kept, not lost
  });

  it("does nothing on a missing data root", async () => {
    const res = await migrateWorkflowRename(path.join(root, "nope"));
    expect(res.skipped).toBe(true);
  });
});
