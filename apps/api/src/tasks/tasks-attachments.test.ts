import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { AttachmentStorageService } from "./attachment-storage.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import { TaskClassifierService } from "./task-classifier.service";
import { TaskSchedulerService } from "./task-scheduler.service";
import { TasksController } from "./tasks.controller";

/**
 * HTTP e2e for the multipart attachment upload route. Boots a MINIMAL testing
 * module — only what the upload path needs — to avoid starting the full
 * TasksModule/AppModule and its background schedulers. The heavy collaborators
 * the ts-rest handler would use are stubbed; only {@link AttachmentStorageService}
 * (which writes to the VITEST-pinned ZIBBY_DATA_DIR) is real.
 */
describe("POST /api/tasks/attachments", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        AttachmentStorageService,
        { provide: TaskClassifierService, useValue: {} },
        { provide: TaskSchedulerService, useValue: {} },
        { provide: ScheduledTasksStorageService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("uploads files and returns a set id + metadata", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/tasks/attachments")
      .attach("files", Buffer.from("hello"), "a.txt")
      .attach("files", Buffer.from("x,y"), "b.csv");
    expect(res.status).toBe(201);
    expect(res.body.attachmentSetId).toMatch(/^set_/);
    expect(res.body.files).toHaveLength(2);
    expect(res.body.files[0]).toMatchObject({ name: "a.txt", size: 5 });
  });

  it("rejects a file over the per-file size limit with 413", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, 1); // 11 MB > 10 MB
    const res = await request(app.getHttpServer())
      .post("/api/tasks/attachments")
      .attach("files", big, "big.bin");
    expect(res.status).toBe(413);
  });

  it("rejects more than the per-set file count with 413", async () => {
    let req = request(app.getHttpServer()).post("/api/tasks/attachments");
    for (let i = 0; i < 21; i++) {
      req = req.attach("files", Buffer.from("x"), `f${i}.txt`);
    }
    const res = await req;
    expect(res.status).toBe(413);
  });

  it("rejects a set whose total exceeds 50 MB with 413", async () => {
    // Each file is under the 10 MB per-file cap and the count is under 20, so this
    // exercises the manual total-set check (not multer): 6 × 9 MB = 54 MB > 50 MB.
    let req = request(app.getHttpServer()).post("/api/tasks/attachments");
    for (let i = 0; i < 6; i++) {
      req = req.attach("files", Buffer.alloc(9 * 1024 * 1024, 1), `f${i}.bin`);
    }
    const res = await req;
    expect(res.status).toBe(413);
  });
});

/**
 * HTTP e2e for the Phase 65 open-file serve route — the counterpart of the upload
 * route above. Same minimal testing module; only {@link AttachmentStorageService} is
 * real (writes to the vitest-pinned ZIBBY_DATA_DIR).
 */
describe("GET /api/tasks/attachments/:setId/:name", () => {
  let app: INestApplication;
  let attachments: AttachmentStorageService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        AttachmentStorageService,
        { provide: TaskClassifierService, useValue: {} },
        { provide: TaskSchedulerService, useValue: {} },
        { provide: ScheduledTasksStorageService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    attachments = moduleRef.get(AttachmentStorageService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves an existing file with the right content-type and inline disposition", async () => {
    const { attachmentSetId } = await attachments.save([
      { originalname: "notes.txt", size: 5, mimetype: "text/plain", buffer: Buffer.from("hello") },
    ]);
    const res = await request(app.getHttpServer()).get(
      `/api/tasks/attachments/${attachmentSetId}/notes.txt`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/plain/);
    expect(res.headers["content-disposition"]).toBe('inline; filename="notes.txt"');
    expect(res.text).toBe("hello");
  });

  it("falls back to application/octet-stream when no media type was recorded", async () => {
    const { attachmentSetId } = await attachments.save([
      { originalname: "blob.bin", size: 3, buffer: Buffer.from("xyz") },
    ]);
    const res = await request(app.getHttpServer()).get(
      `/api/tasks/attachments/${attachmentSetId}/blob.bin`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/octet-stream/);
  });

  it("404s for an unknown set id", async () => {
    const res = await request(app.getHttpServer()).get("/api/tasks/attachments/set_missing/a.txt");
    expect(res.status).toBe(404);
  });

  it("404s for an unknown file name inside a real set", async () => {
    const { attachmentSetId } = await attachments.save([
      { originalname: "a.txt", size: 1, mimetype: "text/plain", buffer: Buffer.from("x") },
    ]);
    const res = await request(app.getHttpServer()).get(
      `/api/tasks/attachments/${attachmentSetId}/nope.txt`,
    );
    expect(res.status).toBe(404);
  });

  it("contains a traversal attempt to the set's own directory (no escape)", async () => {
    const { attachmentSetId } = await attachments.save([
      { originalname: "a.txt", size: 1, mimetype: "text/plain", buffer: Buffer.from("x") },
    ]);
    // `..%2F..%2F..%2Fetc%2Fpasswd` decodes to a traversal attempt in the `:name` param;
    // `path.basename` collapses it to a single segment that can't escape the set dir.
    const res = await request(app.getHttpServer()).get(
      `/api/tasks/attachments/${attachmentSetId}/..%2F..%2F..%2Fetc%2Fpasswd`,
    );
    expect(res.status).toBe(404);
  });

  it("contains a traversal attempt via the :setId param (no escape)", async () => {
    const res = await request(app.getHttpServer()).get(
      "/api/tasks/attachments/..%2F..%2Fetc/passwd",
    );
    expect(res.status).toBe(404);
  });
});
