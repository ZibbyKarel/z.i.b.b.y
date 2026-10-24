import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { TODO_MAX_ITEMS, type TodoItem, TodoItemSchema } from "@zibby/contracts";
import { z } from "zod";
import { ensureDir, safeJson, withPathLock, writeFileAtomic } from "../shared/file-storage";

export const TODO_FILE = "TODO_FILE";

/** Thrown when the list already holds {@link TODO_MAX_ITEMS} notes. */
export class TodoFullError extends Error {
  constructor() {
    super(`The TODO list is full (${TODO_MAX_ITEMS} notes) — delete one first`);
    this.name = "TodoFullError";
  }
}

const ItemsSchema = z.array(TodoItemSchema);

/**
 * The operator's TODO notes (`data/todo/items.json`) — one small file, re-read on every
 * operation (the file is the source of truth), written atomically, and every
 * read-modify-write serialised through one path lock. A missing or corrupt file is an
 * empty list, never an error.
 */
@Injectable()
export class TodoStore {
  constructor(@Inject(TODO_FILE) private readonly file: string) {}

  private async load(): Promise<TodoItem[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch {
      return [];
    }
    const parsed = ItemsSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : [];
  }

  private async save(items: TodoItem[]): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(items, null, 2)}\n`);
  }

  /** Every note, oldest first. */
  async list(): Promise<TodoItem[]> {
    const items = await this.load();
    return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Append a note (text already trimmed by the contract). Throws {@link TodoFullError} at the cap. */
  async create(text: string): Promise<TodoItem> {
    return withPathLock(this.file, async () => {
      const items = await this.load();
      if (items.length >= TODO_MAX_ITEMS) throw new TodoFullError();
      const item: TodoItem = {
        id: `todo_${randomBytes(6).toString("hex")}`,
        text,
        createdAt: new Date().toISOString(),
      };
      await this.save([...items, item]);
      return item;
    });
  }

  /** Delete a note; `false` when it does not exist. */
  async remove(id: string): Promise<boolean> {
    return withPathLock(this.file, async () => {
      const items = await this.load();
      const next = items.filter((i) => i.id !== id);
      if (next.length === items.length) return false;
      await this.save(next);
      return true;
    });
  }
}
