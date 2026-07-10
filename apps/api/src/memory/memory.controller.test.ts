import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { MemoryController } from "./memory.controller";
import { MemoryDistillerService } from "./memory-distiller.service";
import {
  ImportPathNotDirectoryError,
  ImportPathNotFoundError,
  ImportPathUnreadableError,
  MemoryImportService,
} from "./memory-import.service";
import { VaultService } from "./vault.service";

/**
 * HTTP e2e for `POST /api/memory/import` (phase 112b) — a MINIMAL testing
 * module (mirrors `machine-config.e2e.test.ts`): `MemoryController` also
 * implements every other `memoryContract` route, so `VaultService` is stubbed
 * (unused by this suite) while `MemoryImportService` is a controllable mock.
 * `MemoryDistillerService` is registered directly as a provider on this ad hoc
 * module (not via `MemoryDistillerModule`) — `MemoryController` resolves it
 * lazily through `ModuleRef.get(..., { strict: false })`, which searches the
 * whole container regardless of which module declared the provider.
 */
describe("POST /api/memory/import", () => {
  let app: INestApplication;
  const stageFrom = vi.fn();
  const distill = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MemoryController],
      providers: [
        { provide: VaultService, useValue: {} },
        { provide: MemoryImportService, useValue: { stageFrom } },
        { provide: MemoryDistillerService, useValue: { distill } },
        TraceContextService,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    stageFrom.mockReset();
    distill.mockReset();
  });

  it("distillNow:false stages only — distillTriggered:false, the distiller is never called", async () => {
    stageFrom.mockResolvedValue({ staged: 2, skipped: 1, skippedByReason: { "unsupported-type": 1 }, distillTriggered: false });

    const res = await request(app.getHttpServer())
      .post("/api/memory/import")
      .send({ sourcePath: "/tmp/some-folder", distillNow: false });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      staged: 2,
      skipped: 1,
      skippedByReason: { "unsupported-type": 1 },
      distillTriggered: false,
    });
    expect(stageFrom).toHaveBeenCalledWith("/tmp/some-folder");
    expect(distill).not.toHaveBeenCalled();
  });

  it("distillNow:true returns immediately with distillTriggered:true without awaiting the distiller", async () => {
    stageFrom.mockResolvedValue({ staged: 1, skipped: 0, distillTriggered: false });
    let resolveDistill: (value: string) => void = () => undefined;
    const deferred = new Promise<string>((resolve) => {
      resolveDistill = resolve;
    });
    distill.mockImplementation(() => deferred);

    const res = await request(app.getHttpServer())
      .post("/api/memory/import")
      .send({ sourcePath: "/tmp/some-folder", distillNow: true });

    // The HTTP response already came back even though `deferred` above is still
    // unresolved — proof the detached run was never awaited.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ staged: 1, skipped: 0, distillTriggered: true });
    expect(distill).toHaveBeenCalledTimes(1);

    // Let the detached run settle so it doesn't leak into the next test.
    resolveDistill("memory-distill:1");
    await new Promise((resolve) => setImmediate(resolve));
  });

  it("maps a bad sourcePath (not found) to 400", async () => {
    stageFrom.mockRejectedValue(new ImportPathNotFoundError("/tmp/missing"));
    const res = await request(app.getHttpServer())
      .post("/api/memory/import")
      .send({ sourcePath: "/tmp/missing", distillNow: false });
    expect(res.status).toBe(400);
  });

  it("maps a non-directory sourcePath to 422", async () => {
    stageFrom.mockRejectedValue(new ImportPathNotDirectoryError("/tmp/file.txt"));
    const res = await request(app.getHttpServer())
      .post("/api/memory/import")
      .send({ sourcePath: "/tmp/file.txt", distillNow: false });
    expect(res.status).toBe(422);
  });

  it("maps an unreadable sourcePath to 422", async () => {
    stageFrom.mockRejectedValue(new ImportPathUnreadableError("/tmp/locked"));
    const res = await request(app.getHttpServer())
      .post("/api/memory/import")
      .send({ sourcePath: "/tmp/locked", distillNow: false });
    expect(res.status).toBe(422);
  });
});
