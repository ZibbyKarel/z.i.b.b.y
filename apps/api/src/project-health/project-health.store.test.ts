import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ProjectHealthStatus } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectHealthStore } from "./project-health.store";

const STATUS: ProjectHealthStatus = {
  projectId: "acme",
  url: "https://acme.dev/health",
  state: "down",
  sinceAt: "2026-10-24T08:00:00.000Z",
  checkedAt: "2026-10-24T08:05:00.000Z",
  httpStatus: 503,
  latencyMs: 12,
  error: "HTTP 503",
};

describe("ProjectHealthStore", () => {
  let dir: string;
  let store: ProjectHealthStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "project-health-store-"));
    store = new ProjectHealthStore(path.join(dir, "project-health"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("lists nothing and reads null when the dir does not exist yet", async () => {
    expect(await store.list()).toEqual([]);
    expect(await store.read("acme")).toBeNull();
  });

  it("writes one <projectId>.json and a fresh store reads it back", async () => {
    await store.write(STATUS);
    const raw = JSON.parse(
      await fs.readFile(path.join(dir, "project-health", "acme.json"), "utf8"),
    );
    expect(raw).toEqual(STATUS);
    const fresh = new ProjectHealthStore(path.join(dir, "project-health"));
    expect(await fresh.read("acme")).toEqual(STATUS);
    expect(await fresh.list()).toEqual([STATUS]);
  });

  it("overwrites on every write (state, not history)", async () => {
    await store.write(STATUS);
    await store.write({ ...STATUS, state: "up", error: undefined, httpStatus: 200 });
    expect((await store.read("acme"))?.state).toBe("up");
    expect(await store.list()).toHaveLength(1);
  });

  it("lists sorted by projectId and filters by projectId", async () => {
    await store.write({ ...STATUS, projectId: "zeta" });
    await store.write(STATUS);
    expect((await store.list()).map((s) => s.projectId)).toEqual(["acme", "zeta"]);
    expect((await store.list({ projectId: "zeta" })).map((s) => s.projectId)).toEqual(["zeta"]);
  });

  it("deletes a status file; deleting a missing one is a no-op", async () => {
    await store.write(STATUS);
    await store.delete("acme");
    expect(await store.read("acme")).toBeNull();
    await expect(store.delete("acme")).resolves.toBeUndefined();
  });

  it("skips garbage files when listing", async () => {
    await store.write(STATUS);
    await fs.writeFile(path.join(dir, "project-health", "broken.json"), "{ nope");
    expect(await store.list()).toEqual([STATUS]);
    expect(await store.read("broken")).toBeNull();
  });

  it("validates the project id before any path join (traversal rejected)", async () => {
    await expect(store.write({ ...STATUS, projectId: "../evil" })).rejects.toThrow();
    expect(await store.read("../evil")).toBeNull();
    await expect(store.delete("../../etc/passwd")).rejects.toThrow();
  });
});
