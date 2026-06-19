import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";

/** Focused coverage of the M8 dead-letter mark* methods (attempt counter + statuses). */
describe("ScheduledTasksStorageService — dead-letter (M8)", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "dlq-"));
    storage = new ScheduledTasksStorageService(dir);
    await storage.onModuleInit();
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  async function seed() {
    return storage.create({ text: "do it", scheduledAt: 1000 }, new Date(0).toISOString());
  }

  it("markFailed increments attempts and sets failed", async () => {
    const task = await seed();
    const failed = await storage.markFailed(task.id, "boom");
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(1);
    expect(failed.error).toBe("boom");
  });

  it("markRetry re-schedules at nextAt and increments attempts", async () => {
    const task = await seed();
    const retried = await storage.markRetry(task.id, 5000, "transient");
    expect(retried.status).toBe("scheduled");
    expect(retried.scheduledAt).toBe(5000);
    expect(retried.attempts).toBe(1);
    const again = await storage.markRetry(task.id, 9000, "transient again");
    expect(again.attempts).toBe(2);
  });

  it("markDeadLettered sets the terminal dead-letter status + increments attempts", async () => {
    const task = await seed();
    await storage.markRetry(task.id, 5000, "1");
    await storage.markRetry(task.id, 9000, "2");
    const dead = await storage.markDeadLettered(task.id, "exhausted");
    expect(dead.status).toBe("dead-letter");
    expect(dead.attempts).toBe(3);
    expect(dead.error).toBe("exhausted");
  });

  it("a dead-letter task is not cancellable (terminal)", async () => {
    const task = await seed();
    const dead = await storage.markDeadLettered(task.id, "x");
    const afterCancel = await storage.cancel(dead.id);
    expect(afterCancel.status).toBe("dead-letter"); // unchanged — terminal
  });
});
