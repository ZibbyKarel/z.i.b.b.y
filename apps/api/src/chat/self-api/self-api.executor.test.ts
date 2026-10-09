import { type AddressInfo } from "node:net";
import { createServer } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityLogService } from "../../activity/activity-log.service";
import {
  MAX_RESULT_CHARS,
  READ_DATA_PREFIX,
  type SelfApiClient,
  SelfApiExecutor,
  type SelfApiRouteCall,
  createLoopbackSelfApiClient,
} from "./self-api.executor";

const record = vi.fn();
const activity = { record } as unknown as ActivityLogService;
const routes = new Map<string, SelfApiRouteCall>();
const client: SelfApiClient = (router, route) => routes.get(`${router}.${route}`);

function stub(name: string, impl: SelfApiRouteCall) {
  const fn = vi.fn(impl);
  routes.set(name, fn);
  return fn;
}

describe("SelfApiExecutor", () => {
  let exec: SelfApiExecutor;
  beforeEach(() => {
    routes.clear();
    record.mockReset();
    exec = new SelfApiExecutor(client, activity);
  });

  it("lists operations with their tier", () => {
    const text = exec.list();
    expect(text).toContain("integrations.updateIntegration");
    expect(text).toContain("[write]");
    expect(text).not.toContain("setCredentials");
  });

  it("describes an operation with its method, path and body JSON schema", () => {
    const res = exec.describe("integrations.updateIntegration");
    expect(res.ok).toBe(true);
    expect(res.text).toContain("PATCH /api/integrations/:id");
    expect(res.text).toContain('"body"');
  });

  it("describes the body policy up front", () => {
    const res = exec.describe("automations.createAutomation");
    expect(res.text).toContain('"denyPaths"');
    expect(res.text).toContain("target.toolGrants");
    expect(res.text).toContain('"forceBody"');
    expect(exec.describe("projects.updateProject").text).toContain('"allowKeys"');
  });

  it("rejects an unknown or denied operation without calling the API", async () => {
    const res = await exec.call("integrations.setCredentials", {});
    expect(res.ok).toBe(false);
    expect(res.text).toContain("api_list_operations");
  });

  it("runs a read silently (no activity)", async () => {
    stub("projects.getProject", async () => ({ status: 200, body: { id: "cms4" } }));
    const res = await exec.call("projects.getProject", { params: { id: "cms4" } });
    expect(res.ok).toBe(true);
    expect(res.text).toContain('"cms4"');
    expect(res.text.startsWith(READ_DATA_PREFIX)).toBe(true);
    expect(record).not.toHaveBeenCalled();
  });

  it("does not mark write results as DATA", async () => {
    stub("teams.createTeam", async () => ({ status: 201, body: {} }));
    const res = await exec.call("teams.createTeam", { body: { id: "t" } });
    expect(res.text.startsWith("HTTP 201")).toBe(true);
  });

  it("records params.runId as the runRef activity ref", async () => {
    stub("taskRuns.assignTaskRunProject", async () => ({ status: 200, body: {} }));
    await exec.call("taskRuns.assignTaskRunProject", {
      params: { runId: "run_1" },
      body: { projectId: "p" },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        refs: { action: "taskRuns.assignTaskRunProject", runRef: "run_1" },
      }),
    );
  });

  describe("path params", () => {
    it.each([
      ["../x"],
      ["a/b"],
      ["a?b"],
      ["a#b"],
      ["%2e%2e"],
      [".."],
      ["."],
      ["../../approvals/X/approve?"],
    ])("rejects id %j without calling the API", async (id) => {
      const fn = stub("projects.getProject", async () => ({ status: 200, body: {} }));
      const res = await exec.call("projects.getProject", { params: { id } });
      expect(res).toEqual({ ok: false, text: "Neplatné parametry cesty." });
      expect(fn).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it("rejects a missing path param", async () => {
      const fn = stub("projects.getProject", async () => ({ status: 200, body: {} }));
      const res = await exec.call("projects.getProject", {});
      expect(res.ok).toBe(false);
      expect(fn).not.toHaveBeenCalled();
    });

    it("rejects an extra path param", async () => {
      const fn = stub("projects.listProjects", async () => ({ status: 200, body: [] }));
      const res = await exec.call("projects.listProjects", { params: { id: "x" } });
      expect(res.ok).toBe(false);
      expect(fn).not.toHaveBeenCalled();
    });

    it("blocks traversal through the real loopback client; a valid id hits exactly its path", async () => {
      const urls: string[] = [];
      const server = createServer((req, res) => {
        urls.push(req.url ?? "");
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "cms4" }));
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      try {
        const { port } = server.address() as AddressInfo;
        const real = new SelfApiExecutor(
          createLoopbackSelfApiClient(`http://127.0.0.1:${port}`),
          activity,
        );
        const bad = await real.call("projects.getProject", {
          params: { id: "../../approvals/X/approve?" },
        });
        expect(bad.ok).toBe(false);
        expect(urls).toEqual([]);
        const good = await real.call("projects.getProject", { params: { id: "cms4" } });
        expect(good.ok).toBe(true);
        expect(urls).toEqual(["/api/projects/cms4"]);
      } finally {
        await new Promise((r) => server.close(r));
      }
    });
  });

  const jiraCurrent = {
    id: "cms4-jira",
    config: { kind: "jira", baseUrl: "https://j.example", email: "a@b.c", projectKey: "OLD" },
  };

  it("records a successful write as self-api-write with refs", async () => {
    stub("integrations.getIntegration", async () => ({ status: 200, body: jiraCurrent }));
    const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
    const res = await exec.call("integrations.updateIntegration", {
      params: { id: "cms4-jira" },
      body: { config: { projectKey: "NEW" } },
    });
    expect(res.ok).toBe(true);
    expect(fn).toHaveBeenCalledWith({
      params: { id: "cms4-jira" },
      body: {
        config: {
          kind: "jira",
          baseUrl: "https://j.example",
          email: "a@b.c",
          projectKey: "NEW",
        },
      },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "self-api-write",
        refs: { action: "integrations.updateIntegration", integrationId: "cms4-jira" },
      }),
    );
  });

  it("does NOT record a failed write and surfaces the status", async () => {
    stub("projects.getProject", async () => ({ status: 200, body: { id: "x" } }));
    stub("projects.updateProject", async () => ({ status: 400, body: { message: "bad" } }));
    const res = await exec.call("projects.updateProject", { params: { id: "x" }, body: {} });
    expect(res.ok).toBe(false);
    expect(res.text).toContain("HTTP 400");
    expect(record).not.toHaveBeenCalled();
  });

  it("merges a partial system config onto the current one before PUT", async () => {
    stub("system.getConfig", async () => ({
      status: 200,
      body: { taskTickMs: 30000, maxWorkingAgents: 3 },
    }));
    const put = stub("system.putConfig", async () => ({ status: 200, body: {} }));
    await exec.call("system.putConfig", { body: { maxWorkingAgents: 5 } });
    expect(put).toHaveBeenCalledWith({ body: { taskTickMs: 30000, maxWorkingAgents: 5 } });
  });

  it("defaults a missing body to {} for non-GET routes", async () => {
    const fn = stub("integrations.testIntegration", async () => ({ status: 200, body: {} }));
    await exec.call("integrations.testIntegration", { params: { id: "cms4-jira" } });
    expect(fn).toHaveBeenCalledWith({ params: { id: "cms4-jira" }, body: {} });
  });

  it("truncates huge results", async () => {
    stub("taskRuns.getTaskRunLogs", async () => ({
      status: 200,
      body: "x".repeat(MAX_RESULT_CHARS * 2),
    }));
    const res = await exec.call("taskRuns.getTaskRunLogs", { params: { runId: "r" } });
    expect(res.text.length).toBeLessThan(MAX_RESULT_CHARS + 200);
    expect(res.text).toContain("zkráceno");
  });

  it("turns a thrown fetch into an error result", async () => {
    stub("projects.listProjects", async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await exec.call("projects.listProjects", {});
    expect(res.ok).toBe(false);
    expect(res.text).toContain("ECONNREFUSED");
  });

  describe("body policy", () => {
    it("rejects a key outside allowKeys without calling the API", async () => {
      const fn = stub("projects.updateProject", async () => ({ status: 200, body: {} }));
      const res = await exec.call("projects.updateProject", {
        params: { id: "x" },
        body: { name: "ok", autonomy_policy: {} },
      });
      expect(res.ok).toBe(false);
      expect(res.text).toContain("autonomy_policy");
      expect(res.text).toContain("UI");
      expect(fn).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it("rejects a denied path found through an array", async () => {
      const fn = stub("projects.updateProject", async () => ({ status: 200, body: {} }));
      const res = await exec.call("projects.updateProject", {
        params: { id: "x" },
        body: { identity: { people: [{ name: "a" }, { vip: false }] } },
      });
      expect(res.ok).toBe(false);
      expect(res.text).toContain("identity.people");
      expect(fn).not.toHaveBeenCalled();
    });

    it("rejects a denied nested path (config.baseUrl)", async () => {
      const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
      const res = await exec.call("integrations.updateIntegration", {
        params: { id: "i" },
        body: { config: { kind: "jira", baseUrl: "https://evil.example" } },
      });
      expect(res.ok).toBe(false);
      expect(res.text).toContain("config.baseUrl");
      expect(fn).not.toHaveBeenCalled();
    });

    it("allows changing only config.projectKey", async () => {
      stub("integrations.getIntegration", async () => ({ status: 200, body: jiraCurrent }));
      const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
      const res = await exec.call("integrations.updateIntegration", {
        params: { id: "cms4-jira" },
        body: { config: { projectKey: "CMS" } },
      });
      expect(res.ok).toBe(true);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("overwrites forceBody keys (approval auto -> ask, enabled -> false)", async () => {
      const fn = stub("automations.createAutomation", async () => ({ status: 200, body: {} }));
      const res = await exec.call("automations.createAutomation", {
        body: { name: "n", approval: "auto", enabled: true },
      });
      expect(res.ok).toBe(true);
      expect(fn).toHaveBeenCalledWith({ body: { name: "n", approval: "ask", enabled: false } });
    });

    it("forces updateAutomation disabled too", async () => {
      const fn = stub("automations.updateAutomation", async () => ({ status: 200, body: {} }));
      await exec.call("automations.updateAutomation", {
        params: { id: "a" },
        body: { enabled: true },
      });
      expect(fn).toHaveBeenCalledWith({
        params: { id: "a" },
        body: { enabled: false, approval: "ask" },
      });
    });

    it("rejects updateIntegration projectId (outside allowKeys)", async () => {
      const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
      const res = await exec.call("integrations.updateIntegration", {
        params: { id: "i" },
        body: { projectId: "other" },
      });
      expect(res.ok).toBe(false);
      expect(res.text).toContain("projectId");
      expect(fn).not.toHaveBeenCalled();
    });

    it("allows runtime switches (channelTickMs) and merges onto current config", async () => {
      stub("system.getConfig", async () => ({ status: 200, body: { maxWorkingAgents: 3 } }));
      const put = stub("system.putConfig", async () => ({ status: 200, body: {} }));
      const res = await exec.call("system.putConfig", { body: { channelTickMs: 0 } });
      expect(res.ok).toBe(true);
      expect(put).toHaveBeenCalledWith({ body: { maxWorkingAgents: 3, channelTickMs: 0 } });
    });

    it("keeps a self-hosted sentry baseUrl when only minLevel is patched", async () => {
      stub("integrations.getIntegration", async () => ({
        status: 200,
        body: {
          config: { kind: "sentry", org: "o", project: "p", baseUrl: "https://s.example" },
        },
      }));
      const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
      await exec.call("integrations.updateIntegration", {
        params: { id: "s" },
        body: { config: { minLevel: "warning" } },
      });
      expect(fn).toHaveBeenCalledWith({
        params: { id: "s" },
        body: {
          config: {
            kind: "sentry",
            org: "o",
            project: "p",
            baseUrl: "https://s.example",
            minLevel: "warning",
          },
        },
      });
    });

    it("rejects config.kind", async () => {
      const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
      const res = await exec.call("integrations.updateIntegration", {
        params: { id: "i" },
        body: { config: { kind: "sentry" } },
      });
      expect(res.ok).toBe(false);
      expect(res.text).toContain("config.kind");
      expect(fn).not.toHaveBeenCalled();
    });

    it("rejects updateProject identity.people", async () => {
      const fn = stub("projects.updateProject", async () => ({ status: 200, body: {} }));
      const res = await exec.call("projects.updateProject", {
        params: { id: "x" },
        body: { identity: { people: [{ name: "a", role: "r" }] } },
      });
      expect(res.ok).toBe(false);
      expect(res.text).toContain("identity.people");
      expect(fn).not.toHaveBeenCalled();
    });

    it("merges identity onto the current one, keeping people with vip", async () => {
      const people = [{ name: "a", role: "r", vip: true }];
      stub("projects.getProject", async () => ({ status: 200, body: { identity: { people } } }));
      const fn = stub("projects.updateProject", async () => ({ status: 200, body: {} }));
      await exec.call("projects.updateProject", {
        params: { id: "x" },
        body: { name: "n", identity: { note: "hi" } },
      });
      expect(fn).toHaveBeenCalledWith({
        params: { id: "x" },
        body: { name: "n", identity: { people, note: "hi" } },
      });
    });

    it("rejects updateCompany people", async () => {
      const fn = stub("companies.updateCompany", async () => ({ status: 200, body: {} }));
      const res = await exec.call("companies.updateCompany", {
        params: { id: "c" },
        body: { people: [{ name: "a" }] },
      });
      expect(res.ok).toBe(false);
      expect(fn).not.toHaveBeenCalled();
    });

    it("does not write when the current entity cannot be loaded", async () => {
      stub("integrations.getIntegration", async () => ({ status: 404, body: {} }));
      const fn = stub("integrations.updateIntegration", async () => ({ status: 200, body: {} }));
      const res = await exec.call("integrations.updateIntegration", {
        params: { id: "i" },
        body: { config: { projectKey: "X" } },
      });
      expect(res.ok).toBe(false);
      expect(fn).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it("still reports ok when the activity log throws after a successful write", async () => {
      record.mockRejectedValueOnce(new Error("disk full"));
      stub("teams.createTeam", async () => ({ status: 201, body: {} }));
      const res = await exec.call("teams.createTeam", { body: { id: "t" } });
      expect(res.ok).toBe(true);
    });

    it("rejects a non-object putConfig body without reading or writing", async () => {
      const get = stub("system.getConfig", async () => ({ status: 200, body: { a: 1 } }));
      const put = stub("system.putConfig", async () => ({ status: 200, body: {} }));
      const res = await exec.call("system.putConfig", { body: "nope" });
      expect(res.ok).toBe(false);
      expect(get).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });
  });
});
