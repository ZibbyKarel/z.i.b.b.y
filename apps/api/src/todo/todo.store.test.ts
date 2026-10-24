import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { TODO_MAX_ITEMS } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TodoFullError, TodoStore } from "./todo.store";

describe("TodoStore", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "todo-store-"));
    file = path.join(dir, "todo", "items.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("reads an empty list when the file is missing", async () => {
    expect(await new TodoStore(file).list()).toEqual([]);
  });

  it("reads an empty list from a corrupt file", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ nope");
    expect(await new TodoStore(file).list()).toEqual([]);
  });

  it("creates items with opaque todo_ ids, oldest first, persisted", async () => {
    const store = new TodoStore(file);
    const a = await store.create("first");
    const b = await store.create("second @Kodér");
    expect(a.id).toMatch(/^todo_/);
    expect(a.id).not.toBe(b.id);
    expect((await store.list()).map((i) => i.text)).toEqual(["first", "second @Kodér"]);
    expect((await new TodoStore(file).list()).map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it("removes an item and reports whether it existed", async () => {
    const store = new TodoStore(file);
    const a = await store.create("first");
    expect(await store.remove(a.id)).toBe(true);
    expect(await store.remove(a.id)).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("rejects the 201st item with a cap error", async () => {
    const store = new TodoStore(file);
    for (let i = 0; i < TODO_MAX_ITEMS; i++) await store.create(`n${i}`);
    await expect(store.create("one too many")).rejects.toBeInstanceOf(TodoFullError);
    expect(await store.list()).toHaveLength(TODO_MAX_ITEMS);
  });

  it("persists two concurrent creates", async () => {
    const store = new TodoStore(file);
    await Promise.all([store.create("a"), store.create("b")]);
    expect((await store.list()).map((i) => i.text).sort()).toEqual(["a", "b"]);
  });

  it("keeps valid entries and preserves the file when one entry is invalid", async () => {
    const good = { id: "todo_a", text: "keep", createdAt: "2026-10-24T10:00:00.000Z" };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify([good, { id: "bad" }]));
    const store = new TodoStore(file);
    expect(await store.list()).toEqual([good]);
    await store.create("new");
    expect((await store.list()).map((i) => i.text)).toEqual(["keep", "new"]);
    const aside = (await fs.readdir(path.dirname(file))).filter((f) => f.includes(".corrupt-"));
    expect(aside).toHaveLength(1);
    expect(await fs.readFile(path.join(path.dirname(file), aside[0] as string), "utf8")).toContain(
      '"bad"',
    );
  });

  it("renames an unparseable file aside instead of overwriting it", async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, "{ not json");
    const store = new TodoStore(file);
    await store.create("fresh");
    expect((await store.list()).map((i) => i.text)).toEqual(["fresh"]);
    const aside = (await fs.readdir(path.dirname(file))).filter((f) => f.includes(".corrupt-"));
    expect(aside).toHaveLength(1);
    expect(await fs.readFile(path.join(path.dirname(file), aside[0] as string), "utf8")).toBe(
      "{ not json",
    );
  });
});
