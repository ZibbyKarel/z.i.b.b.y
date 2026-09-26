import type { Project, ScheduledTask, TaskParentState } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ProjectsStorageService } from "../projects/projects.storage.service";
import type { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import { TaskParentsService } from "./task-parents.service";

const AT = "2026-06-16T00:00:00.000Z";

/** Minimal valid `ScheduledTask`, overridden per test — mirrors the fixture style in task-runs.service.test.ts. */
function task(overrides: Partial<ScheduledTask> & Pick<ScheduledTask, "id">): ScheduledTask {
  return {
    title: "",
    text: "do it",
    paths: [],
    toolGrants: [],
    attachments: [],
    scheduledAt: Date.parse(AT),
    status: "dispatched",
    createdAt: AT,
    ...overrides,
  };
}

function build(tasks: ScheduledTask[], projects: Project[] = []) {
  const storage = { list: vi.fn(async () => tasks) };
  const projectsStore = { list: vi.fn(async () => projects) };
  return new TaskParentsService(
    storage as unknown as ScheduledTasksStorageService,
    projectsStore as unknown as ProjectsStorageService,
  );
}

describe("TaskParentsService — state derivation (ZB-04a §5, PART-B.md table)", () => {
  const cases: Array<{ name: string; task: ScheduledTask; want: TaskParentState }> = [
    { name: "failed dispatch → error", task: task({ id: "t1", status: "failed" }), want: "error" },
    {
      name: "dead-letter → error",
      task: task({ id: "t2", status: "dead-letter" }),
      want: "error",
    },
    {
      name: "dispatched with an error outcome → error",
      task: task({
        id: "t3",
        status: "dispatched",
        outcome: { status: "error", summary: "boom", finishedAt: AT },
      }),
      want: "error",
    },
    { name: "held → blocked", task: task({ id: "t4", status: "held" }), want: "blocked" },
    {
      name: "awaiting-output → blocked",
      task: task({ id: "t5", status: "awaiting-output" }),
      want: "blocked",
    },
    {
      name: "dispatched, no outcome yet → working",
      task: task({ id: "t6", status: "dispatched" }),
      want: "working",
    },
    {
      name: "dispatched with a done outcome → done",
      task: task({
        id: "t7",
        status: "dispatched",
        outcome: { status: "done", summary: "ok", finishedAt: AT },
      }),
      want: "done",
    },
    {
      name: "cancelled → done (closed cleanly)",
      task: task({ id: "t8", status: "cancelled" }),
      want: "done",
    },
    {
      name: "scheduled → thinking",
      task: task({ id: "t9", status: "scheduled" }),
      want: "thinking",
    },
    { name: "queued → thinking", task: task({ id: "t10", status: "queued" }), want: "thinking" },
  ];

  it.each(cases)("$name", async ({ task: t, want }) => {
    const service = build([t]);
    const page = await service.listParents({});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.state).toBe(want);
  });
});

describe("TaskParentsService — parent state rolls up over subtasks", () => {
  it("any subtask errored → parent is error, even if others are done", async () => {
    const parent = task({ id: "p1", status: "dispatched" });
    const kid1 = task({ id: "k1", parentTaskId: "p1", status: "failed" });
    const kid2 = task({
      id: "k2",
      parentTaskId: "p1",
      status: "dispatched",
      outcome: { status: "done", summary: "ok", finishedAt: AT },
    });
    const service = build([parent, kid1, kid2]);
    const page = await service.listParents({});
    expect(page.items[0]?.state).toBe("error");
    expect(page.items[0]?.subtasks).toHaveLength(2);
  });

  it("no subtasks yet → parent's own state is used as the sole entry", async () => {
    const parent = task({ id: "p2", status: "held" });
    const service = build([parent]);
    const page = await service.listParents({});
    expect(page.items[0]?.state).toBe("blocked");
  });

  it("a chain-target parent never resolves to done — falls through to thinking", async () => {
    const parent = task({
      id: "p3",
      status: "dispatched",
      target: { kind: "chain", id: "c1", name: "Chain" },
      outcome: { status: "done", summary: "ok", finishedAt: AT },
    });
    const kid = task({
      id: "k3",
      parentTaskId: "p3",
      status: "dispatched",
      outcome: { status: "done", summary: "ok", finishedAt: AT },
    });
    const service = build([parent, kid]);
    const page = await service.listParents({});
    expect(page.items[0]?.state).toBe("thinking");
  });
});

describe("TaskParentsService — listParents filters and pagination", () => {
  const p1 = task({
    id: "p1",
    createdAt: "2026-06-16T00:00:01.000Z",
    projectId: "acme",
    department: "rel",
  });
  const p2 = task({
    id: "p2",
    createdAt: "2026-06-16T00:00:02.000Z",
    projectId: "other",
    source: "operator",
  });
  const child = task({ id: "c1", parentTaskId: "p1", status: "scheduled" });
  const projects: Project[] = [
    { id: "acme", name: "Acme", path: "/repos/acme", companyId: "acme-co" } as Project,
  ];

  it("only top-level tasks (no parentTaskId) are returned", async () => {
    const service = build([p1, p2, child]);
    const page = await service.listParents({});
    expect(page.items.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("filters by project, department and source", async () => {
    const service = build([p1, p2]);
    expect((await service.listParents({ project: "acme" })).items.map((p) => p.id)).toEqual(["p1"]);
    expect((await service.listParents({ department: "rel" })).items.map((p) => p.id)).toEqual([
      "p1",
    ]);
    expect((await service.listParents({ source: "operator" })).items.map((p) => p.id)).toEqual([
      "p2",
    ]);
  });

  it("filters by company via the project store", async () => {
    const service = build([p1, p2], projects);
    expect((await service.listParents({ company: "acme-co" })).items.map((p) => p.id)).toEqual([
      "p1",
    ]);
  });

  it("newest-first, with a cursor that excludes everything at/after it", async () => {
    const service = build([p1, p2]);
    const page = await service.listParents({ limit: 1 });
    expect(page.items.map((p) => p.id)).toEqual(["p2"]);
    expect(page.nextCursor).not.toBeNull();
    const next = await service.listParents({ limit: 1, before: page.nextCursor ?? undefined });
    expect(next.items.map((p) => p.id)).toEqual(["p1"]);
    expect(next.nextCursor).toBeNull();
  });
});

describe("TaskParentsService — getTask includes subtasks", () => {
  it("attaches every child stamped with this parent's id", async () => {
    const parent = task({ id: "p1", status: "dispatched" });
    const kid = task({ id: "k1", parentTaskId: "p1", status: "held", department: "rel" });
    const storage = {
      list: vi.fn(async () => [parent, kid]),
      get: vi.fn(async () => parent),
    };
    const service = new TaskParentsService(
      storage as unknown as ScheduledTasksStorageService,
      { list: vi.fn(async () => []) } as unknown as ProjectsStorageService,
    );
    const detail = await service.getTask("p1");
    expect(detail.subtasks).toEqual([{ taskId: "k1", department: "rel", state: "blocked" }]);
  });
});

describe("TaskParentsService — getDepartmentSubtasks", () => {
  it("returns only subtasks (parentTaskId set) stamped to that department", async () => {
    const parent = task({ id: "p1", status: "dispatched" });
    const kidSales = task({ id: "k1", parentTaskId: "p1", department: "rel", status: "held" });
    const kidOps = task({ id: "k2", parentTaskId: "p1", department: "ops", status: "dispatched" });
    const notAChild = task({ id: "p2", department: "rel", status: "dispatched" });
    const service = build([parent, kidSales, kidOps, notAChild]);
    const rows = await service.getDepartmentSubtasks("rel");
    expect(rows.map((r) => r.taskId)).toEqual(["k1"]);
  });
});
