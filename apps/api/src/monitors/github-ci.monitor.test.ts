import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { GithubCiMonitor } from "./github-ci.monitor";

const INTEGRATION: Integration = {
  id: "acme-github",
  kind: "github",
  projectId: "acme",
  enabled: true,
  status: "connected",
  hasCredentials: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls", "ci"] },
};

const CREDS = { token: "ghp_x" };

const run = (over: Record<string, unknown>) => ({
  id: 42,
  run_attempt: 1,
  name: "build.yml",
  status: "completed",
  conclusion: "failure",
  head_branch: "main",
  head_sha: "abc123",
  html_url: "https://github.com/acme/app/actions/runs/42",
  created_at: "2026-07-02T08:00:00Z",
  updated_at: "2026-07-02T08:12:00Z",
  ...over,
});

const fetchWith = (runs: unknown[], status = 200) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ workflow_runs: runs }),
  })) as unknown as typeof fetch;

describe("GithubCiMonitor", () => {
  it("wants only github integrations that opted into the ci stream", () => {
    const monitor = new GithubCiMonitor(fetchWith([]));
    expect(monitor.wants(INTEGRATION)).toBe(true);
    expect(
      monitor.wants({
        ...INTEGRATION,
        config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"] },
      }),
    ).toBe(false);
    expect(
      monitor.wants({
        ...INTEGRATION,
        kind: "slack",
        config: { kind: "slack", channels: [] },
      } as Integration),
    ).toBe(false);
  });

  it("a completed red run becomes an alert with a deterministic per-attempt id", async () => {
    const monitor = new GithubCiMonitor(fetchWith([run({})]));
    const { events, cursor } = await monitor.poll(INTEGRATION, CREDS, undefined);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "ci-acme-app-42-1",
      kind: "ci-run-failed",
      title: "CI red: build.yml failed on main",
      url: "https://github.com/acme/app/actions/runs/42",
    });
    expect(events[0]?.detail).toContain("abc123");
    expect(cursor).toBe("2026-07-02T08:00:00Z");
  });

  it("green and in-progress runs are a no-op (the cursor still advances)", async () => {
    const monitor = new GithubCiMonitor(
      fetchWith([
        run({ id: 1, conclusion: "success" }),
        run({ id: 2, status: "in_progress", conclusion: null, created_at: "2026-07-02T09:00:00Z" }),
      ]),
    );
    const { events, cursor } = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(events).toHaveLength(0);
    expect(cursor).toBe("2026-07-02T09:00:00Z");
  });

  it("runs at or before the cursor are skipped; a retried attempt is a new occurrence", async () => {
    const monitor = new GithubCiMonitor(
      fetchWith([
        run({ created_at: "2026-07-02T08:00:00Z" }), // == cursor → skipped
        run({ id: 42, run_attempt: 2, created_at: "2026-07-02T10:00:00Z" }),
      ]),
    );
    const { events } = await monitor.poll(INTEGRATION, CREDS, "2026-07-02T08:00:00Z");
    expect(events.map((e) => e.id)).toEqual(["ci-acme-app-42-2"]);
  });

  it("timed_out and startup_failure read as red too", async () => {
    const monitor = new GithubCiMonitor(
      fetchWith([
        run({ id: 1, conclusion: "timed_out" }),
        run({ id: 2, conclusion: "startup_failure", created_at: "2026-07-02T08:30:00Z" }),
      ]),
    );
    const { events } = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(events).toHaveLength(2);
  });

  it("N4b status: the newest decisive run sets red; sinceAt walks the red streak", async () => {
    const monitor = new GithubCiMonitor(
      fetchWith([
        // Newest-first, as GitHub returns them.
        run({ id: 3, updated_at: "2026-07-02T10:00:00Z" }),
        run({ id: 2, status: "in_progress", conclusion: null }), // decides nothing
        run({ id: 1, updated_at: "2026-07-02T09:00:00Z" }),
        run({ id: 0, conclusion: "success", updated_at: "2026-07-02T08:00:00Z" }),
      ]),
    );
    const { status } = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(status).toMatchObject({
      state: "red",
      sinceAt: "2026-07-02T09:00:00.000Z", // oldest run of the red streak, not the newest
      summary: "build.yml failed on main",
      url: "https://github.com/acme/app/actions/runs/42",
    });
  });

  it("N4b status: green when the newest decisive run succeeded — even with old reds behind it", async () => {
    const monitor = new GithubCiMonitor(
      fetchWith([
        run({ id: 2, conclusion: "success", updated_at: "2026-07-02T10:00:00Z" }),
        run({ id: 1, updated_at: "2026-07-02T09:00:00Z" }), // red, older → streak broken
      ]),
    );
    const { status } = await monitor.poll(INTEGRATION, CREDS, undefined);
    expect(status).toMatchObject({ state: "green", sinceAt: "2026-07-02T10:00:00.000Z" });
    expect(status?.summary).toContain("passing");
  });

  it("N4b status: undefined when no run is decisive (cancelled/in-progress/empty page)", async () => {
    const cases = [
      [],
      [run({ status: "in_progress", conclusion: null }), run({ conclusion: "cancelled" })],
    ];
    for (const runs of cases) {
      const { status } = await new GithubCiMonitor(fetchWith(runs)).poll(
        INTEGRATION,
        CREDS,
        undefined,
      );
      expect(status).toBeUndefined();
    }
  });

  it("N4b status: computed from the WHOLE page, so a cursored re-poll still refreshes it", async () => {
    const monitor = new GithubCiMonitor(fetchWith([run({})]));
    // Cursor at the run's created_at → no new alert, but the status still reads red.
    const { events, status } = await monitor.poll(INTEGRATION, CREDS, "2026-07-02T08:00:00Z");
    expect(events).toHaveLength(0);
    expect(status?.state).toBe("red");
  });

  it("a rate limit throws (the watcher's retry/backoff owns it)", async () => {
    const monitor = new GithubCiMonitor(fetchWith([], 403));
    await expect(monitor.poll(INTEGRATION, CREDS, undefined)).rejects.toThrow("rate limited");
  });

  it("no token throws before any network call", async () => {
    const fetchImpl = fetchWith([]);
    const monitor = new GithubCiMonitor(fetchImpl);
    await expect(monitor.poll(INTEGRATION, { password: "x" }, undefined)).rejects.toThrow(
      "no github token",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
