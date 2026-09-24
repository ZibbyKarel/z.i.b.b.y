import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubsystemFindingsStore } from "../subsystems/subsystem-findings.store";
import { LoomService } from "./loom.service";

const SAMPLE_REPORT = [
  "# Graph Report - z.i.b.b.y",
  "",
  "## God Nodes (most connected - your core abstractions)",
  "1. `AppShell()` - 40 edges",
  "2. `Button()` - 3 edges",
  "",
  "## Communities (1 total)",
  "",
  '### Community 0 - "LoggerService"',
  "Cohesion: 0.03",
  "Nodes (45): AgentProposalFlowService, FrontmatterPreview (+43 more)",
  "",
  "## Knowledge Gaps",
  "- none",
  "",
].join("\n");

function makeLogger() {
  return { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }) };
}

function makeVault(body = "") {
  const notes = new Map<string, { body: string }>();
  return {
    note: vi.fn(async (id: string) => {
      const stored = notes.get(id);
      if (stored) return { id, title: "Quality Findings", tier: "memory", body: stored.body };
      if (!body) throw new Error("not found");
      return { id, title: "Quality Findings", tier: "memory", body };
    }),
    updateNote: vi.fn(async (id: string, patch: { body: string }) => {
      if (!notes.has(id)) throw new Error("not found");
      notes.set(id, { body: patch.body });
      return { id };
    }),
    createNote: vi.fn(async ({ id, body: b }: { id: string; body: string }) => {
      notes.set(id, { body: b });
      return { id };
    }),
    updateIndex: vi.fn(async () => ({ id: "subsystem-loom-moc" })),
    notes,
  };
}

const NO_CYCLES = vi.fn(async () => ({ stdout: "[]", stderr: "" }));

interface BuildOpts {
  reportPath?: string;
  execImpl?: ReturnType<typeof vi.fn>;
  vault?: ReturnType<typeof makeVault>;
  findingsDir?: string;
  evaluate?: ReturnType<typeof vi.fn>;
}

async function build(opts: BuildOpts = {}) {
  const vault = opts.vault ?? makeVault();
  const activity = { record: vi.fn(async () => undefined) };
  // Fake HandoffService — LoomService now emits a signal per new finding (A3);
  // the seed rule is tier-3, so `evaluate` returning "none"/"proposed" (never
  // "dispatched" by the real rule table) is the realistic double here.
  const handoff = { evaluate: opts.evaluate ?? vi.fn(async () => ({ action: "proposed" })) };
  const findingsDir =
    opts.findingsDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "loom-findings-")));
  const findingsStore = new SubsystemFindingsStore(findingsDir, makeLogger() as never);
  // A path that does not exist by default — mirrors SelfKnowledgeService's test
  // convention ("codebaseShape absent" is the default state).
  const reportPath = opts.reportPath ?? path.join(findingsDir, "GRAPH_REPORT.md");

  const service = new LoomService(
    vault as never,
    findingsStore,
    activity as never,
    handoff as never,
    reportPath,
    makeLogger() as never,
    (opts.execImpl ?? NO_CYCLES) as never,
  );
  return { service, vault, activity, handoff, findingsDir, findingsStore };
}

describe("LoomService.audit", () => {
  let tmpReportDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpReportDirs) await fs.rm(dir, { recursive: true, force: true });
    tmpReportDirs = [];
  });

  it("a fixture graphify report over the threshold writes a proposal onto Loom's shelf and records activity", async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "loom-report-"));
    tmpReportDirs.push(reportDir);
    const reportPath = path.join(reportDir, "GRAPH_REPORT.md");
    await fs.writeFile(reportPath, SAMPLE_REPORT, "utf8");

    const { service, vault, activity, handoff } = await build({ reportPath });
    const { findings } = await service.audit(new Date("2026-07-17T00:00:00.000Z"));

    // AppShell (40 edges >= 25) is a god-node finding; Button (3 edges) is not.
    // LoggerService (45 nodes >= 40) is an oversized-community finding.
    expect(findings.map((f) => f.kind).sort()).toEqual(["community", "god-node"]);
    expect(vault.createNote).toHaveBeenCalledTimes(1);
    expect(vault.updateIndex).toHaveBeenCalledWith(
      "subsystem-loom-moc",
      "suggestions/quality-findings",
      expect.any(String),
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "subsystem-scan" }),
    );
    // Every new finding is normalized into a handoff signal — no severity, no
    // projectId (only Sentinel's CVEs carry severity).
    expect(handoff.evaluate).toHaveBeenCalledTimes(2);
    expect(handoff.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "loom", kind: "god-node" }),
    );
    expect(handoff.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "loom", kind: "community" }),
    );
    for (const call of handoff.evaluate.mock.calls as unknown as Array<
      [{ severity?: string; projectId?: string }]
    >) {
      expect(call[0].severity).toBeUndefined();
      expect(call[0].projectId).toBeUndefined();
    }
  });

  it("a stubbed madge cycle is filed as a finding", async () => {
    const cycle = ["apps/web/a.ts", "apps/web/b.ts"];
    const execImpl = vi.fn(async () => ({ stdout: JSON.stringify([cycle]), stderr: "" }));
    const { service, vault } = await build({ execImpl });

    const { findings } = await service.audit(new Date());

    expect(findings).toEqual([{ kind: "cycle", fingerprint: expect.any(String), members: cycle }]);
    const noteBody = vault.notes.get("suggestions/quality-findings")?.body ?? "";
    expect(noteBody).toContain("apps/web/a.ts → apps/web/b.ts");
  });

  it("issues no knip invocation — v1 does not depend on it", async () => {
    const execImpl = vi.fn(async () => ({ stdout: "[]", stderr: "" }));
    const { service } = await build({ execImpl });
    await service.audit(new Date());
    for (const call of execImpl.mock.calls as unknown as Array<[string, string[]]>) {
      expect(call[0]).not.toBe("knip");
      expect(call[1]).not.toContain("knip");
    }
  });

  it("a no-delta scan (same fingerprints as the last snapshot) writes nothing and records nothing", async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "loom-report-nodelta-"));
    tmpReportDirs.push(reportDir);
    const reportPath = path.join(reportDir, "GRAPH_REPORT.md");
    await fs.writeFile(reportPath, SAMPLE_REPORT, "utf8");
    const findingsDir = await fs.mkdtemp(path.join(os.tmpdir(), "loom-findings-nodelta-"));

    const built1 = await build({ reportPath, findingsDir });
    await built1.service.audit(new Date());

    const built2 = await build({ reportPath, findingsDir, vault: built1.vault });
    const { vault, activity, handoff } = built2;
    vault.createNote.mockClear();
    vault.updateNote.mockClear();
    vault.updateIndex.mockClear();
    activity.record.mockClear();

    await built2.service.audit(new Date());

    expect(vault.createNote).not.toHaveBeenCalled();
    expect(vault.updateNote).not.toHaveBeenCalled();
    expect(vault.updateIndex).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
    expect(handoff.evaluate).not.toHaveBeenCalled();
  });

  it("only the NEW finding since the last snapshot triggers a write; the note lists all current findings", async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "loom-report-partial-"));
    tmpReportDirs.push(reportDir);
    const reportPath = path.join(reportDir, "GRAPH_REPORT.md");
    await fs.writeFile(reportPath, SAMPLE_REPORT, "utf8");
    const findingsDir = await fs.mkdtemp(path.join(os.tmpdir(), "loom-findings-partial-"));

    // First run: graphify findings only (no cycle yet) — seeds the snapshot.
    const built1 = await build({ reportPath, findingsDir, execImpl: NO_CYCLES });
    await built1.service.audit(new Date());

    // Second run: same graphify findings PLUS a new cycle.
    const cycle = ["apps/web/a.ts", "apps/web/b.ts"];
    const execImpl2 = vi.fn(async () => ({ stdout: JSON.stringify([cycle]), stderr: "" }));
    const built2 = await build({
      reportPath,
      findingsDir,
      vault: built1.vault,
      execImpl: execImpl2,
    });

    const { findings } = await built2.service.audit(new Date());
    expect(findings).toHaveLength(3);
    expect(built2.activity.record).toHaveBeenCalledTimes(1);
    const noteBody = built2.vault.notes.get("suggestions/quality-findings")?.body ?? "";
    expect(noteBody).toContain("AppShell");
    expect(noteBody).toContain("LoggerService");
    expect(noteBody).toContain("apps/web/a.ts → apps/web/b.ts");
    // Only the NEW finding (the cycle) is handed to the rule engine.
    expect(built2.handoff.evaluate).toHaveBeenCalledTimes(1);
    expect(built2.handoff.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "loom", kind: "cycle" }),
    );
  });

  it("fails open: a missing report skips the graphify source, madge-only findings still filed", async () => {
    const cycle = ["apps/web/a.ts", "apps/web/b.ts"];
    const execImpl = vi.fn(async () => ({ stdout: JSON.stringify([cycle]), stderr: "" }));
    const { service } = await build({ execImpl }); // default reportPath does not exist

    const { findings } = await service.audit(new Date());
    expect(findings).toEqual([{ kind: "cycle", fingerprint: expect.any(String), members: cycle }]);
  });

  it("fails open: a rejecting exec skips the cycle source, graphify-only findings still filed", async () => {
    const reportDir = await fs.mkdtemp(path.join(os.tmpdir(), "loom-report-execfail-"));
    tmpReportDirs.push(reportDir);
    const reportPath = path.join(reportDir, "GRAPH_REPORT.md");
    await fs.writeFile(reportPath, SAMPLE_REPORT, "utf8");
    const execImpl = vi.fn(async () => {
      throw new Error("madge: command not found");
    });

    const { service } = await build({ reportPath, execImpl });
    const { findings } = await service.audit(new Date());
    expect(findings.map((f) => f.kind).sort()).toEqual(["community", "god-node"]);
  });

  it("fails open: a madge non-zero exit that still attaches cycle JSON to the error's stdout recovers the cycles", async () => {
    const cycle = ["apps/web/a.ts", "apps/web/b.ts"];
    const execImpl = vi.fn(async () => {
      const err = new Error("madge exited 1") as Error & { stdout?: string };
      err.stdout = JSON.stringify([cycle]);
      throw err;
    });
    const { service } = await build({ execImpl });
    const { findings } = await service.audit(new Date());
    expect(findings).toEqual([{ kind: "cycle", fingerprint: expect.any(String), members: cycle }]);
  });

  it("both sources absent → total no-op, no throw", async () => {
    const { service } = await build();
    await expect(service.audit(new Date())).resolves.toEqual({ findings: [] });
  });
});

describe("LoomService.readFindings", () => {
  it("reads the checkbox bullet lines back out of the vault note for the briefing", async () => {
    const body =
      "*Updated: 2026-07-17*\n\nOpen code-quality findings:\n\n- [ ] god node: AppShell (degree 40)\n";
    const { service } = await build({ vault: makeVault(body) });
    expect(await service.readFindings()).toEqual(["god node: AppShell (degree 40)"]);
  });

  it("a missing note fails open to an empty array", async () => {
    const { service } = await build({ vault: makeVault("") });
    expect(await service.readFindings()).toEqual([]);
  });
});
