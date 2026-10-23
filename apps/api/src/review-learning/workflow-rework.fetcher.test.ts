import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Approval } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowReworkFetcher, reworkCommentId, reworkLines } from "./workflow-rework.fetcher";

const PROJECT = "/tmp/zibby-publishing";
const DECIDED = "2026-10-20T10:00:00.000Z";
const REASON = [
  "potřebuji přepracovat stránky",
  "2 - Prase má tři oči",
  "17 - opět tři oči",
  "22 - nedokončené linky. přepracuj obrázek",
].join("\n");

function runJson(id: string, projectPath: string): string {
  return JSON.stringify({
    workflowRunId: id,
    workflowId: "coloring-book",
    status: "parked",
    currentStage: null,
    stageRuns: [],
    startedAt: "2026-10-19T10:00:00.000Z",
    cwd: `/tmp/${id}`,
    projectPath,
  });
}

function approval(runId: string): Approval {
  return {
    id: "ap-1",
    runId,
    kind: "workflow-gate",
    skill: "visual-audit",
    action: "gate",
    detail: "d",
    risk: "low",
    status: "revised",
    requestedAt: "2026-10-20T09:00:00.000Z",
    decidedAt: DECIDED,
    reason: REASON,
  } as Approval;
}

describe("WorkflowReworkFetcher", () => {
  let dir: string;
  const warn = vi.fn();
  const logger = { child: () => ({ warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() }) };
  const list = vi.fn();

  const make = () => new WorkflowReworkFetcher(dir, { list } as never, logger as never);
  const fetchNew = (cursor?: string) =>
    make().fetchNew({ projectId: "p", projectPath: PROJECT, ...(cursor ? { cursor } : {}) });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "rework-"));
    list.mockResolvedValue([approval("run-a")]);
    const a = path.join(dir, "run-a");
    await fs.mkdir(path.join(a, "book"), { recursive: true });
    await fs.writeFile(path.join(a, "run.json"), runJson("run-a", PROJECT));
    await fs.writeFile(
      path.join(a, "visual-audit.note.md"),
      `${REASON}\n- resume-parked: chybí pozadí\n`,
    );
    await fs.writeFile(
      path.join(a, "book", "rejections.md"),
      [
        "- pages 3: operator review: pig has three eyes",
        "- pages 10: turkey is drawn with two heads and two beaks; redraw with one head",
      ].join("\n"),
    );
    const b = path.join(dir, "run-b");
    await fs.mkdir(b);
    await fs.writeFile(path.join(b, "run.json"), runJson("run-b", "/tmp/other"));
    await fs.writeFile(path.join(b, "x.note.md"), "something else entirely");
    const bad = path.join(dir, "run-bad");
    await fs.mkdir(bad);
    await fs.writeFile(path.join(bad, "run.json"), "{not json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("emits each approval reason line once, deduping the note.md copy", async () => {
    const bodies = (await fetchNew()).comments.map((c) => c.body);
    for (const line of reworkLines(REASON))
      expect(bodies.filter((b) => b === line)).toHaveLength(1);
    expect(bodies).toContain("resume-parked: chybí pozadí");
  });

  it('skips "operator review:" lines in rejections.md but keeps QA lines', async () => {
    const { comments } = await fetchNew();
    const turkey = comments.find((c) => c.body.includes("turkey"));
    expect(turkey?.author).toBe("visual-audit");
    expect(comments.some((c) => c.body.includes("operator review"))).toBe(false);
  });

  it("ignores runs of other projects", async () => {
    const { comments } = await fetchNew();
    expect(comments.some((c) => c.prUrl.includes("run-b"))).toBe(false);
    expect(
      comments.every((c) => c.prUrl === "workflow-run:run-a" && c.prNumber === undefined),
    ).toBe(true);
  });

  it("ids are stable across calls", async () => {
    const one = (await fetchNew()).comments.map((c) => c.commentId);
    const two = (await fetchNew()).comments.map((c) => c.commentId);
    expect(one).toEqual(two);
    expect(reworkCommentId("run-a", " 2 - Prase  má tři oči ")).toBe(
      reworkCommentId("run-a", "2 - Prase má tři oči"),
    );
  });

  it("cursor filters older items", async () => {
    const old = new Date("2026-10-01T00:00:00.000Z");
    const a = path.join(dir, "run-a");
    await fs.utimes(path.join(a, "visual-audit.note.md"), old, old);
    await fs.utimes(path.join(a, "book", "rejections.md"), old, old);
    expect((await fetchNew(DECIDED)).comments).toEqual([]);
    expect((await fetchNew("2026-10-10T00:00:00.000Z")).comments.length).toBeGreaterThan(0);
  });

  it("corrupt run.json is skipped, not thrown", async () => {
    await expect(fetchNew()).resolves.toBeDefined();
  });

  it("reports incomplete when approvals.list rejects", async () => {
    list.mockRejectedValue(new Error("boom"));
    const res = await fetchNew();
    expect(res.incomplete).toBe(true);
    expect(res.comments.length).toBeGreaterThan(0); // files still read
  });

  it("reports incomplete when a run scan throws", async () => {
    const note = path.join(dir, "run-a", "visual-audit.note.md");
    await fs.chmod(note, 0o000);
    try {
      expect((await fetchNew()).incomplete).toBe(true);
    } finally {
      await fs.chmod(note, 0o644);
    }
  });

  it("is complete on a clean scan, with a missing runs dir counting as empty", async () => {
    expect((await fetchNew()).incomplete).toBe(false);
    const missing = new WorkflowReworkFetcher(
      path.join(dir, "nope"),
      { list } as never,
      logger as never,
    );
    expect(await missing.fetchNew({ projectId: "p", projectPath: PROJECT })).toEqual({
      comments: [],
      incomplete: false,
    });
  });

  it("ignores symlinked note files and rejections.md", async () => {
    const a = path.join(dir, "run-a");
    const outside = path.join(dir, "outside.txt");
    await fs.writeFile(outside, "secret outside line");
    await fs.symlink(outside, path.join(a, "evil.note.md"));
    await fs.rm(path.join(a, "book", "rejections.md"));
    await fs.symlink(outside, path.join(a, "book", "rejections.md"));
    const res = await fetchNew();
    expect(res.incomplete).toBe(false);
    expect(res.comments.some((c) => c.body.includes("secret outside"))).toBe(false);
  });
});
