import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EntityFileStore } from "./entity-file-store";

interface TestEntity {
  id: string;
  counter: number;
}

const ID_REGEX = /^[a-zA-Z0-9._-]+$/;

class TestEntityNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Test entity "${id}" not found`);
    this.name = "TestEntityNotFoundError";
  }
}
class TestEntityInvalidIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid test entity id: "${id}"`);
    this.name = "TestEntityInvalidIdError";
  }
}

function isTestEntity(value: unknown): value is TestEntity {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Partial<TestEntity>).id === "string" &&
    typeof (value as Partial<TestEntity>).counter === "number"
  );
}

/**
 * Minimal concrete subclass so the base class's protected `updateEntity` /
 * `createEntity` helpers (Task 3) can be exercised directly, without pulling in
 * any real subclass's domain shape.
 */
class TestEntityStore extends EntityFileStore<TestEntity> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = ID_REGEX;

  protected idOf(entity: TestEntity): string {
    return entity.id;
  }

  protected serialize(entity: TestEntity): string {
    return JSON.stringify(entity);
  }

  protected tryParse(raw: string): TestEntity | null {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isTestEntity(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  protected compare(a: TestEntity, b: TestEntity): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new TestEntityNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new TestEntityInvalidIdError(id);
  }

  // Re-expose the protected helpers under test as public methods.
  async publicWriteEntity(entity: TestEntity): Promise<void> {
    return this.writeEntity(entity);
  }

  async publicUpdateEntity(
    id: string,
    mutate: (current: TestEntity) => TestEntity,
  ): Promise<TestEntity> {
    return this.updateEntity(id, mutate);
  }

  async publicCreateEntity(
    id: string,
    factory: () => TestEntity,
  ): Promise<TestEntity | null> {
    return this.createEntity(id, factory);
  }
}

describe("EntityFileStore concurrency helpers (Task 3)", () => {
  let dir: string;
  let store: TestEntityStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "entity-file-store-test-"));
    store = new TestEntityStore(dir);
    await store.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("updateEntity", () => {
    it("N concurrent increments all land — final counter === N (lost-update regression)", async () => {
      await store.publicWriteEntity({ id: "e1", counter: 0 });

      const N = 25;
      await Promise.all(
        Array.from({ length: N }, () =>
          store.publicUpdateEntity("e1", (cur) => ({ ...cur, counter: cur.counter + 1 })),
        ),
      );

      const final = await store.get("e1");
      expect(final.counter).toBe(N);
    });

    it("mutate may throw to abort without writing", async () => {
      await store.publicWriteEntity({ id: "e2", counter: 5 });

      await expect(
        store.publicUpdateEntity("e2", () => {
          throw new Error("abort");
        }),
      ).rejects.toThrow("abort");

      const untouched = await store.get("e2");
      expect(untouched.counter).toBe(5);
    });

    it("returns the updated entity", async () => {
      await store.publicWriteEntity({ id: "e3", counter: 1 });
      const updated = await store.publicUpdateEntity("e3", (cur) => ({
        ...cur,
        counter: cur.counter + 41,
      }));
      expect(updated).toEqual({ id: "e3", counter: 42 });
    });
  });

  describe("createEntity", () => {
    it("exactly one of two concurrent same-id creates wins, the other returns null", async () => {
      const results = await Promise.all([
        store.publicCreateEntity("dup", () => ({ id: "dup", counter: 1 })),
        store.publicCreateEntity("dup", () => ({ id: "dup", counter: 2 })),
      ]);

      const winners = results.filter((r) => r !== null);
      const losers = results.filter((r) => r === null);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);

      // Never a torn read: the persisted entity is exactly one of the two writes.
      const persisted = await store.get("dup");
      expect([1, 2]).toContain(persisted.counter);
    });

    it("returns null (no throw, no write) when the id already exists", async () => {
      await store.publicWriteEntity({ id: "exists", counter: 1 });
      const result = await store.publicCreateEntity("exists", () => ({
        id: "exists",
        counter: 999,
      }));
      expect(result).toBeNull();
      const persisted = await store.get("exists");
      expect(persisted.counter).toBe(1);
    });

    it("creates and returns the entity when the id is free", async () => {
      const result = await store.publicCreateEntity("fresh", () => ({
        id: "fresh",
        counter: 7,
      }));
      expect(result).toEqual({ id: "fresh", counter: 7 });
      expect(await store.get("fresh")).toEqual({ id: "fresh", counter: 7 });
    });
  });
});
