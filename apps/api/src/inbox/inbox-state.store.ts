import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type InboxState, InboxStateSchema, type SetInboxHidden } from "@zibby/contracts";
import { ensureDir, safeJson, withPathLock, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of `inbox-state.json`. */
export const INBOX_STATE_FILE = "INBOX_STATE_FILE";

/**
 * The operator's hidden Inbox items (`.zibby/data/inbox-state.json`, gitignored —
 * operator-personal). A missing/garbage file reads as `{ hidden: [] }`; writes are
 * atomic. Mirrors `MachineConfigStore`.
 */
@Injectable()
export class InboxStateStore {
  constructor(@Inject(INBOX_STATE_FILE) private readonly file: string) {}

  async read(): Promise<InboxState> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    const parsed = InboxStateSchema.safeParse(raw === null ? null : safeJson(raw));
    return parsed.success ? parsed.data : { hidden: [] };
  }

  /** Idempotent add/remove by `(integrationId, externalId)`. */
  setHidden({ integrationId, externalId, hidden }: SetInboxHidden): Promise<InboxState> {
    return withPathLock(this.file, async () => {
      const rest = (await this.read()).hidden.filter(
        (key) => key.integrationId !== integrationId || key.externalId !== externalId,
      );
      const next: InboxState = {
        hidden: hidden ? [...rest, { integrationId, externalId }] : rest,
      };
      await ensureDir(path.dirname(this.file));
      await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }
}
