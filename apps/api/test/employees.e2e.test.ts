import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";

/** Env vars this suite pins to its own isolated temp dirs (never the shared `data-test` seed). */
const ISOLATED_ENV_VARS = ["AGENTS_DIR", "EMPLOYEES_DIR", "EMPLOYEE_NAMES_DIR"] as const;

async function boot(): Promise<{ app: INestApplication; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "employees-e2e-"));
  process.env.AGENTS_DIR = path.join(dir, "agents");
  process.env.EMPLOYEES_DIR = path.join(dir, "employees");
  process.env.EMPLOYEE_NAMES_DIR = path.join(dir, "employee-names");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, dir };
}

async function teardown(app: INestApplication, dir: string): Promise<void> {
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
  for (const key of ISOLATED_ENV_VARS) delete process.env[key];
}

async function createAgent(app: INestApplication, id: string): Promise<void> {
  await request(app.getHttpServer())
    .post("/api/agents")
    .send({
      id,
      name: id,
      category: "Test",
      description: `Test position ${id}`,
      instructions: "Do the thing.",
      department: "dev",
    })
    .expect(201);
}

describe("Employees API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    ({ app, dir } = await boot());
    await createAgent(app, "koder");
    await createAgent(app, "architekt");
  });

  afterAll(async () => {
    await teardown(app, dir);
  });

  describe("hire (POST /api/departments/:id/employees)", () => {
    it("hires a position into a department, claiming a pool name (201)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "koder" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ agentId: "koder", department: "dev", status: "active" });
      expect(typeof res.body.name).toBe("string");
    });

    it("hires with a specific requested name when free (201)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "architekt", name: "Ziggy" });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Ziggy");
    });

    it("409s hiring with an already-claimed name (EmployeeNameUnavailableError)", async () => {
      await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "koder", name: "Barry" })
        .expect(201);
      const res = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "architekt", name: "Barry" });
      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("message");
    });

    it("404s hiring into an unknown department", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/departments/ghost-dept/employees")
        .send({ agentId: "koder" });
      expect(res.status).toBe(404);
    });

    it("404s hiring an unknown position (agent)", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "ghost-agent" });
      expect(res.status).toBe(404);
    });
  });

  describe("list / get", () => {
    it("GET /api/employees lists every hired employee, filterable by department/agentId/status", async () => {
      const res = await request(app.getHttpServer()).get("/api/employees");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const byAgent = await request(app.getHttpServer()).get("/api/employees?agentId=koder");
      expect(byAgent.status).toBe(200);
      expect((byAgent.body as Array<{ agentId: string }>).every((e) => e.agentId === "koder")).toBe(
        true,
      );
    });

    it("GET /api/employees/:id returns the matching employee with derived state", async () => {
      const hired = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "koder", name: "Otto" })
        .expect(201);
      const res = await request(app.getHttpServer()).get(`/api/employees/${hired.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: hired.body.id, name: "Otto", state: "idle" });
    });

    it("GET /api/employees/:id 404s for an unknown id", async () => {
      const res = await request(app.getHttpServer()).get("/api/employees/employee_ghost");
      expect(res.status).toBe(404);
    });
  });

  describe("update (PATCH /api/employees/:id)", () => {
    it("renames, releasing the old name back to the pool (200)", async () => {
      const hired = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "koder", name: "Mel" })
        .expect(201);
      const renamed = await request(app.getHttpServer())
        .patch(`/api/employees/${hired.body.id}`)
        .send({ name: "Lance" });
      expect(renamed.status).toBe(200);
      expect(renamed.body.name).toBe("Lance");

      // "Mel" is free again.
      const other = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "architekt", name: "Mel" });
      expect(other.status).toBe(201);
    });

    it("409s renaming onto an already-taken name", async () => {
      const a = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "koder", name: "Herb" })
        .expect(201);
      await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "architekt", name: "Gus" })
        .expect(201);
      const res = await request(app.getHttpServer())
        .patch(`/api/employees/${a.body.id}`)
        .send({ name: "Gus" });
      expect(res.status).toBe(409);
    });

    it("404s updating an unknown employee", async () => {
      const res = await request(app.getHttpServer())
        .patch("/api/employees/employee_ghost")
        .send({ name: "Whoever" });
      expect(res.status).toBe(404);
    });
  });

  describe("fire (DELETE /api/employees/:id)", () => {
    it("soft-fires: status flips and the held name returns to the pool (200)", async () => {
      const hired = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "koder", name: "Frank" })
        .expect(201);
      const fired = await request(app.getHttpServer()).delete(`/api/employees/${hired.body.id}`);
      expect(fired.status).toBe(200);
      expect(fired.body.status).toBe("fired");

      const rehired = await request(app.getHttpServer())
        .post("/api/departments/dev/employees")
        .send({ agentId: "architekt", name: "Frank" });
      expect(rehired.status).toBe(201);
    });

    it("404s firing an unknown employee", async () => {
      const res = await request(app.getHttpServer()).delete("/api/employees/employee_ghost");
      expect(res.status).toBe(404);
    });
  });
});

describe("Employee names API (e2e)", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    ({ app, dir } = await boot());
  });

  afterAll(async () => {
    await teardown(app, dir);
  });

  it("GET /api/employee-names lists the seeded pool", async () => {
    const res = await request(app.getHttpServer()).get("/api/employee-names");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("POST /api/employee-names adds a name outside the seed (201)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/employee-names")
      .send({ name: "Custom" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Custom");
  });

  it("409s a duplicate name", async () => {
    await request(app.getHttpServer())
      .post("/api/employee-names")
      .send({ name: "Dup" })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post("/api/employee-names")
      .send({ name: "Dup" });
    expect(res.status).toBe(409);
  });

  it("PATCH /api/employee-names/:id renames a free entry (200), 404s an unknown id", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/employee-names")
      .send({ name: "Old" })
      .expect(201);
    const renamed = await request(app.getHttpServer())
      .patch(`/api/employee-names/${created.body.id}`)
      .send({ name: "New" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("New");

    const missing = await request(app.getHttpServer())
      .patch("/api/employee-names/empname_ghost")
      .send({ name: "Whatever" });
    expect(missing.status).toBe(404);
  });

  it("DELETE /api/employee-names/:id deletes a free entry (200), 409s one currently in use", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/employee-names")
      .send({ name: "Temp" })
      .expect(201);
    const deleted = await request(app.getHttpServer()).delete(
      `/api/employee-names/${created.body.id}`,
    );
    expect(deleted.status).toBe(200);

    await createAgent(app, "curator");
    const hired = await request(app.getHttpServer())
      .post("/api/departments/knw/employees")
      .send({ agentId: "curator", name: "Chris" })
      .expect(201);
    const namePoolEntry = (await request(app.getHttpServer()).get("/api/employee-names")).body.find(
      (n: { name: string }) => n.name === "Chris",
    );
    const inUse = await request(app.getHttpServer()).delete(
      `/api/employee-names/${namePoolEntry.id}`,
    );
    expect(inUse.status).toBe(409);
    void hired;
  });

  it("DELETE /api/employee-names/:id 404s an unknown id", async () => {
    const res = await request(app.getHttpServer()).delete("/api/employee-names/empname_ghost");
    expect(res.status).toBe(404);
  });
});
