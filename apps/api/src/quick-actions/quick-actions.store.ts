import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type QuickActions, QuickActionsSchema } from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

export const QUICK_ACTIONS_FILE = "QUICK_ACTIONS_FILE";

/**
 * Operator-defined one-click tasks for the Bridge "Quick actions" widget,
 * persisted as `data/quick-actions.json` — same shape as `PinsStore`: one small
 * operator-owned document, loaded synchronously in the constructor; a
 * missing/corrupt file yields an empty list, never an error.
 */
@Injectable()
export class QuickActionsStore {
  private readonly dir: string;
  private actions: QuickActions;

  constructor(@Inject(QUICK_ACTIONS_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
    this.actions = QuickActionsStore.load(file);
  }

  private static load(file: string): QuickActions {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return [];
    }
    const parsed = QuickActionsSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : [];
  }

  async read(): Promise<QuickActions> {
    return this.actions;
  }

  /** Replace the whole list, deduped by id — last occurrence's value wins. */
  async write(next: QuickActions): Promise<QuickActions> {
    const validated = QuickActionsSchema.parse(next);
    const seen = new Map<string, QuickActions[number]>();
    for (const action of validated) seen.set(action.id, action);
    const deduped = [...seen.values()];
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(deduped, null, 2)}\n`);
    this.actions = deduped;
    return deduped;
  }
}
