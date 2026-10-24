import { randomBytes } from "node:crypto";
import { copyFile, readFile, rename } from "node:fs/promises";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { TODO_MAX_ITEMS, type TodoItem, TodoItemSchema } from "@zibby/contracts";
import { ensureDir, safeJson, withPathLock, writeFileAtomic } from "../shared/file-storage";

export const TODO_FILE = "TODO_FILE";

/** Thrown when the list already holds {@link TODO_MAX_ITEMS} notes. */
export class TodoFullError extends Error {
  constructor() {
    super(`The TODO list is full (${TODO_MAX_ITEMS} notes) — delete one first`);
    this.name = "TodoFullError";
  }
}

/**
 * The operator's TODO notes (`data/todo/items.json`) — one small file, re-read on every
 * operation (the file is the source of truth), written atomically, and every
 * read-modify-write serialised through one path lock. A missing or corrupt file is an
 * empty list, never an error.
 */
@Injectable()
export class TodoStore {
  constructor(@Inject(TODO_FILE) private readonly file: string) {}

  private readonly logger = new Logger(TodoStore.name);

  /**
   * Read the file. Valid records are salvaged one by one; `damaged` is set when the file
   * is unparseable (`unreadable`) or holds any invalid record, so a write never silently
   * discards what it could not read.
   */
  private async load(): Promise<{ items: TodoItem[]; damaged: boolean; unreadable: boolean }> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch {
      return { items: [], damaged: false, unreadable: false };
    }
    const json = safeJson(raw);
    if (!Array.isArray(json)) return { items: [], damaged: true, unreadable: true };
    const items: TodoItem[] = [];
    for (const entry of json) {
      const parsed = TodoItemSchema.safeParse(entry);
      if (parsed.success) items.push(parsed.data);
    }
    return { items, damaged: items.length !== json.length, unreadable: false };
  }

  /** Keep a copy of a damaged file beside it before a write replaces it. */
  private async setAside(unreadable: boolean): Promise<void> {
    const aside = `${this.file}.corrupt-${Date.now()}`;
    try {
      if (unreadable) await rename(this.file, aside);
      else await copyFile(this.file, aside);
      this.logger.warn(`TODO file was damaged; preserved the original as ${aside}`);
    } catch (error) {
      this.logger.warn(`Could not preserve damaged TODO file: ${String(error)}`);
    }
  }

  private async save(items: TodoItem[]): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(items, null, 2)}\n`);
  }

  /** Every note, oldest first. */
  async list(): Promise<TodoItem[]> {
    const { items } = await this.load();
    return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Append a note (text already trimmed by the contract). Throws {@link TodoFullError} at the cap. */
  async create(text: string): Promise<TodoItem> {
    return withPathLock(this.file, async () => {
      const { items, damaged, unreadable } = await this.load();
      if (items.length >= TODO_MAX_ITEMS) throw new TodoFullError();
      if (damaged) await this.setAside(unreadable);
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
      const { items, damaged, unreadable } = await this.load();
      const next = items.filter((i) => i.id !== id);
      if (next.length === items.length) return false;
      if (damaged) await this.setAside(unreadable);
      await this.save(next);
      return true;
    });
  }
}
