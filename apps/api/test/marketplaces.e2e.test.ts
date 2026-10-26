import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

// Read-only routes + input validation only: nothing here reaches the real `claude` CLI
// (the one CLI-backed case runs a read-only stub via `CLAUDE_BIN`).
describe("Marketplaces API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "marketplaces-e2e-"));
    process.env.MARKETPLACES_FILE = path.join(dir, "marketplaces.json");
    process.env.CLAUDE_PLUGINS_DIR = path.join(dir, "plugins");
    process.env.MARKETPLACES_CLONE_DIR = path.join(dir, "clones");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.MARKETPLACES_FILE;
    delete process.env.CLAUDE_PLUGINS_DIR;
    delete process.env.MARKETPLACES_CLONE_DIR;
  });

  it("starts with no marketplaces and no marketplace skills", async () => {
    const list = await request(app.getHttpServer()).get("/api/marketplaces");
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const skills = await request(app.getHttpServer()).get("/api/marketplace-skills");
    expect(skills.body).toEqual([]);
  });

  it("404s an unknown marketplace", async () => {
    const res = await request(app.getHttpServer()).get("/api/marketplaces/nope");
    expect(res.status).toBe(404);
  });

  it("400s an empty source and a dev source that is neither a path nor a git URL", async () => {
    const empty = await request(app.getHttpServer())
      .post("/api/marketplaces")
      .send({ source: " ", devMode: false });
    expect(empty.status).toBe(400);
    const relative = await request(app.getHttpServer())
      .post("/api/marketplaces")
      .send({ source: "owner/repo", devMode: true });
    expect(relative.status).toBe(400);
    expect(relative.body.message).toMatch(/absolute local path or a git URL/);
  });

  it("422s a dev connect whose install dir escapes the plugins cache, and stores nothing", async () => {
    // A stub `claude` that already knows the checkout (adopt → no mutating CLI call).
    const checkout = path.join(dir, "checkout");
    const outside = path.join(dir, "outside", "zibby");
    await fs.mkdir(path.join(checkout, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(checkout, ".claude-plugin", "marketplace.json"),
      JSON.stringify({ name: "e2e-mkt", plugins: [{ name: "zibby", source: "./" }] }),
    );
    await fs.mkdir(outside, { recursive: true });
    await fs.mkdir(path.join(dir, "plugins"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 2,
        plugins: { "zibby@e2e-mkt": [{ scope: "user", installPath: outside }] },
      }),
    );
    const stub = path.join(dir, "claude-stub.sh");
    const known = JSON.stringify([{ name: "e2e-mkt", path: checkout, installLocation: checkout }]);
    await fs.writeFile(stub, `#!/bin/sh\necho '${known}'\n`, { mode: 0o755 });
    process.env.CLAUDE_BIN = stub;
    try {
      const res = await request(app.getHttpServer())
        .post("/api/marketplaces")
        .send({ source: checkout, devMode: true });
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/Refusing to modify/);
      const list = await request(app.getHttpServer()).get("/api/marketplaces");
      expect(list.body).toEqual([]);
    } finally {
      delete process.env.CLAUDE_BIN;
    }
  });
});
