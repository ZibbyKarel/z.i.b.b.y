import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { defaultCloneRoot } from "../shared/data-dir";
import { MACHINE_CONFIG_FILE, MachineConfigStore } from "./machine-config.store";
import { MachineActionStore } from "./machine-action.store";
import { MachineConfigService } from "./machine-config.service";
import { MachineController } from "./machine.controller";
import { MachineService } from "./machine.service";

/**
 * HTTP e2e for the Phase 76 per-machine config routes: `GET /machine/config` and
 * `PUT /machine/config`. A MINIMAL testing module (mirrors `tasks-attachments.test.ts`)
 * — `MachineController` also needs `MachineService` and `MachineActionStore` to
 * resolve (the propose/list/get-action routes it also implements), stubbed here
 * since this suite only exercises the config routes.
 */
describe("Phase 76 — GET/PUT /api/machine/config", () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "machine-config-e2e-"));

    const moduleRef = await Test.createTestingModule({
      controllers: [MachineController],
      providers: [
        { provide: MACHINE_CONFIG_FILE, useFactory: () => path.join(dir, "config.json") },
        MachineConfigStore,
        MachineConfigService,
        { provide: MachineActionStore, useValue: {} },
        { provide: MachineService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("GET returns the computed default cloneRoot before any write", async () => {
    const res = await request(app.getHttpServer()).get("/api/machine/config");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cloneRoot: defaultCloneRoot() });
  });

  it("PUT patches the cloneRoot and GET reflects it afterwards", async () => {
    const put = await request(app.getHttpServer())
      .put("/api/machine/config")
      .send({ cloneRoot: "/Users/op/Projects" });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ cloneRoot: "/Users/op/Projects" });

    const get = await request(app.getHttpServer()).get("/api/machine/config");
    expect(get.body).toEqual({ cloneRoot: "/Users/op/Projects" });
  });

  it("PUT with an empty patch leaves the current config unchanged", async () => {
    const put = await request(app.getHttpServer()).put("/api/machine/config").send({});
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ cloneRoot: "/Users/op/Projects" });
  });
});
