import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Integration, Project } from "@zibby/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubsystemFindingsStore } from "../subsystems/subsystem-findings.store";
import { SentinelService } from "./sentinel.service";

const PROJECT: Project = { id: "acme", name: "acme", path: "~/Projects/acme" };

const GITHUB_INTEGRATION: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"], username: "octocat" },
};

const jsonResponse = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const dependabotAlert = (over: Record<string, unknown> = {}) => ({
  number: 1,
  security_advisory: { severity: "high", cve_id: "CVE-2026-1111", summary: "prototype pollution" },
  dependency: { package: { name: "lodash" } },
  html_url: "https://github.com/acme/app/security/dependabot/1",
  ...over,
});

function makeLogger() {
  return { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }) };
}

function makeVault(body = "") {
  const notes = new Map<string, { body: string }>();
  return {
    note: vi.fn(async (id: string) => {
      const stored = notes.get(id);
      if (stored) return { id, title: "Security Findings", tier: "memory", body: stored.body };
      if (!body) throw new Error("not found");
      return { id, title: "Security Findings", tier: "memory", body };
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
    updateIndex: vi.fn(async () => ({ id: "subsystem-sentinel-moc" })),
    notes,
  };
}

interface BuildOpts {
  projects?: Project[];
  integrations?: Integration[];
  token?: string | null;
  fetchImpl?: typeof fetch;
  localPath?: string | null;
  vault?: ReturnType<typeof makeVault>;
  evaluate?: ReturnType<typeof vi.fn>;
  findingsDir?: string;
}

async function build(opts: BuildOpts) {
  const projects = opts.projects ?? [PROJECT];
  const integrations = opts.integrations ?? [GITHUB_INTEGRATION];
  const projectsStore = { list: async () => projects };
  const resolvedProjects = { resolveIntegrations: async () => integrations };
  const credentials = {
    read: async () =>
      opts.token === undefined ? { token: "ghp_x" } : opts.token ? { token: opts.token } : null,
  };
  const projectLocal = {
    resolve: async () =>
      opts.localPath === null || opts.localPath === undefined
        ? { present: false }
        : { present: true, isGitRepo: true, resolvedPath: opts.localPath },
  };
  const vault = opts.vault ?? makeVault();
  // Fake HandoffService — SentinelService no longer dispatches directly (A3); it
  // normalizes each finding into a HandoffSignal and hands it to `evaluate`.
  const handoff = { evaluate: opts.evaluate ?? vi.fn(async () => ({ action: "none" })) };
  const activity = { record: vi.fn(async () => undefined) };
  const findingsDir =
    opts.findingsDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-findings-")));
  const findingsStore = new SubsystemFindingsStore(findingsDir, makeLogger() as never);

  const service = new SentinelService(
    projectsStore as never,
    resolvedProjects as never,
    credentials as never,
    projectLocal as never,
    vault as never,
    handoff as never,
    activity as never,
    findingsStore,
    makeLogger() as never,
    opts.fetchImpl,
  );
  return { service, vault, handoff, activity, findingsDir, findingsStore };
}

describe("SentinelService.scan", () => {
  let tmpRepoDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpRepoDirs) await fs.rm(dir, { recursive: true, force: true });
    tmpRepoDirs = [];
  });

  it("a new CVE finding writes a proposal note onto Sentinel's shelf, records activity, and hands off a cve signal", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [dependabotAlert({ security_advisory: { severity: "high" } })]),
    ) as unknown as typeof fetch;
    const { service, vault, activity, handoff } = await build({ fetchImpl });

    const { findings } = await service.scan(new Date("2026-07-17T00:00:00.000Z"));

    expect(findings).toHaveLength(1);
    expect(vault.createNote).toHaveBeenCalledTimes(1);
    expect(vault.updateIndex).toHaveBeenCalledWith(
      "subsystem-sentinel-moc",
      "suggestions/security-findings",
      expect.any(String),
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "subsystem-scan" }),
    );
    // Every finding is normalized and handed to the rule engine — a high CVE
    // maps to a non-critical handoff severity (the seed rule then gates it out).
    expect(handoff.evaluate).toHaveBeenCalledTimes(1);
    expect(handoff.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ from: "sentinel", kind: "cve", severity: "high" }),
    );
  });

  it("a critical CVE hands off a signal with severity critical and kind cve", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [dependabotAlert({ security_advisory: { severity: "critical" } })]),
    ) as unknown as typeof fetch;
    const { service, handoff } = await build({ fetchImpl });

    await service.scan(new Date());

    expect(handoff.evaluate).toHaveBeenCalledTimes(1);
    const [signal] = handoff.evaluate.mock.calls[0] as unknown as [
      { severity: string; kind: string; title: string; body: string },
    ];
    expect(signal.kind).toBe("cve");
    expect(signal.severity).toBe("critical");
    // Preserves today's exact dispatched-task text.
    expect(signal.title).toContain("kritická zranitelnost");
    expect(signal.body).toContain("PR");
  });

  it("a moderate CVE maps to a non-critical handoff severity", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [dependabotAlert({ security_advisory: { severity: "moderate" } })]),
    ) as unknown as typeof fetch;
    const { service, handoff } = await build({ fetchImpl });

    await service.scan(new Date());

    expect(handoff.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "cve", severity: "moderate" }),
    );
  });

  it("an unknown severity maps to the low rung, never critical", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [dependabotAlert({ security_advisory: { severity: "unknown" } })]),
    ) as unknown as typeof fetch;
    const { service, handoff } = await build({ fetchImpl });

    await service.scan(new Date());

    expect(handoff.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "cve", severity: "low" }),
    );
  });

  it("finds an AKIA-shaped secret in a scanned local clone; the finding line never contains the matched text", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-repo-"));
    tmpRepoDirs.push(root);
    const secret = "AKIAABCDEFGHIJKLMNOP";
    await fs.writeFile(path.join(root, "config.env"), `AWS_KEY=${secret}\n`, "utf8");

    const fetchImpl = vi.fn(async () => jsonResponse(200, [])) as unknown as typeof fetch;
    const { service, vault, handoff } = await build({ fetchImpl, localPath: root });

    const { findings } = await service.scan(new Date());

    const secretFindings = findings.filter((f) => f.kind === "secret");
    expect(secretFindings).toHaveLength(1);
    expect(secretFindings[0]).toMatchObject({
      file: "config.env",
      line: 1,
      rule: "aws-access-key",
    });

    const noteBody = vault.notes.get("suggestions/security-findings")?.body ?? "";
    expect(noteBody).not.toContain(secret);
    for (const call of vault.createNote.mock.calls as Array<[{ body: string }]>) {
      expect(call[0].body).not.toContain(secret);
    }

    // The secret is still normalized into a handoff signal (kind "secret", no
    // severity) — it matches no seed rule so it never dispatches — but the
    // signal itself must NEVER carry the matched secret text.
    expect(handoff.evaluate).toHaveBeenCalledTimes(1);
    const [signal] = handoff.evaluate.mock.calls[0] as unknown as [
      { kind: string; severity?: string; title: string; body: string },
    ];
    expect(signal.kind).toBe("secret");
    expect(signal.severity).toBeUndefined();
    expect(signal.title).not.toContain(secret);
    expect(signal.body).not.toContain(secret);
  });

  it("a clean directory finds no secrets", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-repo-clean-"));
    tmpRepoDirs.push(root);
    await fs.writeFile(path.join(root, "readme.md"), "hello world\n", "utf8");

    const fetchImpl = vi.fn(async () => jsonResponse(200, [])) as unknown as typeof fetch;
    const { service } = await build({ fetchImpl, localPath: root });

    const { findings } = await service.scan(new Date());
    expect(findings).toHaveLength(0);
  });

  it("a green scan (no delta from the last snapshot) writes no proposal note and dispatches nothing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [])) as unknown as typeof fetch;
    const findingsDir = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-findings-"));
    const built1 = await build({ fetchImpl, findingsDir });
    await built1.service.scan(new Date());

    const built2 = await build({ fetchImpl, findingsDir, vault: built1.vault });
    const { vault, handoff, activity } = built2;
    vault.createNote.mockClear();
    vault.updateNote.mockClear();
    vault.updateIndex.mockClear();
    activity.record.mockClear();

    await built2.service.scan(new Date());

    expect(vault.createNote).not.toHaveBeenCalled();
    expect(vault.updateNote).not.toHaveBeenCalled();
    expect(vault.updateIndex).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
    expect(handoff.evaluate).not.toHaveBeenCalled();
  });

  it("fails open: a 403 from Dependabot is skipped without throwing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403, {})) as unknown as typeof fetch;
    const { service } = await build({ fetchImpl });
    await expect(service.scan(new Date())).resolves.toEqual({ findings: [] });
  });

  it("fails open: a project with no github link is skipped without throwing", async () => {
    const fetchImpl = vi.fn();
    const { service } = await build({
      integrations: [],
      fetchImpl: fetchImpl as never,
    });
    await expect(service.scan(new Date())).resolves.toEqual({ findings: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails open: a throwing handoff evaluate is logged, the scan still completes", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, [dependabotAlert({ security_advisory: { severity: "critical" } })]),
    ) as unknown as typeof fetch;
    const evaluate = vi.fn(async () => {
      throw new Error("handoff engine unavailable");
    });
    const { service } = await build({ fetchImpl, evaluate });

    const { findings } = await service.scan(new Date());
    expect(findings).toHaveLength(1);
  });
});

describe("SentinelService.readFindings", () => {
  it("reads the checkbox bullet lines back out of the vault note for the briefing", async () => {
    const body =
      "*Updated: 2026-07-17*\n\nOpen security findings:\n\n- [ ] acme: HIGH vulnerability in lodash\n";
    const { service } = await build({ vault: makeVault(body) });
    expect(await service.readFindings()).toEqual(["acme: HIGH vulnerability in lodash"]);
  });

  it("a missing note fails open to an empty array", async () => {
    const { service } = await build({ vault: makeVault("") });
    expect(await service.readFindings()).toEqual([]);
  });
});
