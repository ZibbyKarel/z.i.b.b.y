import { Inject, Injectable } from "@nestjs/common";
import { type ReplyLedgerEntry, ReplyLedgerEntrySchema } from "@zibby/contracts";
import { EntityFileStore } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** DI token for the root directory holding one file per ledger entry. */
export const HERALD_LEDGER_DIR = "HERALD_LEDGER_DIR";

/** Ledger entry ids are `collisionResistantId("reply")`-shaped — no separators. */
const LEDGER_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface ReplyLedgerFilter {
  integrationId?: string;
  category?: ReplyLedgerEntry["category"];
}

/**
 * NS2 F6a — the durable, auditable record of every drafted reply (Tier-2 auto-send
 * or Tier-3 parked draft). One `<id>.json` per entry under `HERALD_LEDGER_DIR`,
 * modeled on {@link ChannelItemStore}: atomic write, tolerant Zod read (a corrupt
 * entry is skipped, never fatal — fail-open, per the F6 plan's shared conventions).
 * `consecutiveApproved` is the graduation streak counter: newest-first over
 * *decided* outcomes only (pending/sent-auto don't count toward or against the
 * streak), so a trailing `rejected` resets it to 0.
 */
@Injectable()
export class ReplyLedgerStore extends EntityFileStore<ReplyLedgerEntry> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = LEDGER_ID_REGEX;
  private readonly log: ScopedLogger;

  constructor(@Inject(HERALD_LEDGER_DIR) dir: string, logger: LoggerService) {
    super(dir);
    this.log = logger.child(ReplyLedgerStore.name);
  }

  protected idOf(entity: ReplyLedgerEntry): string {
    return entity.id;
  }

  protected serialize(entity: ReplyLedgerEntry): string {
    return JSON.stringify(entity);
  }

  protected tryParse(raw: string, id: string): ReplyLedgerEntry | null {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const parsed = ReplyLedgerEntrySchema.safeParse(json);
    if (!parsed.success) {
      this.log.warn("corrupt reply-ledger entry — skipped (fail-open)", { id });
      return null;
    }
    return parsed.data;
  }

  protected compare(a: ReplyLedgerEntry, b: ReplyLedgerEntry): number {
    return a.proposedAt.localeCompare(b.proposedAt);
  }

  protected notFound(id: string): Error {
    return new Error(`reply-ledger entry "${id}" not found`);
  }

  protected invalidId(id: string): Error {
    return new Error(`invalid reply-ledger entry id: "${id}"`);
  }

  /** Persist a new ledger entry. */
  async record(entry: ReplyLedgerEntry): Promise<ReplyLedgerEntry> {
    await this.writeEntity(entry);
    return entry;
  }

  /**
   * Patch a pending entry's outcome (read-modify-write). A missing entry logs a
   * warning and no-ops (fail-open — never blocks the triage tick that called it).
   */
  async patchOutcome(
    id: string,
    outcome: ReplyLedgerEntry["outcome"],
    decidedAt: string,
  ): Promise<void> {
    try {
      await this.updateEntity(id, (current) => ({ ...current, outcome, decidedAt }));
    } catch (err) {
      this.log.warn("patchOutcome: entry missing — no-op", {
        id,
        error: (err as Error).message,
      });
    }
  }

  /** Tolerant listing, optionally filtered by integration/category. */
  async listFiltered(filter: ReplyLedgerFilter = {}): Promise<ReplyLedgerEntry[]> {
    const all = await this.list();
    return all.filter(
      (e) =>
        (filter.integrationId === undefined || e.integrationId === filter.integrationId) &&
        (filter.category === undefined || e.category === filter.category),
    );
  }

  /**
   * The graduation streak: walk `(integrationId, category)` entries newest-first
   * over DECIDED outcomes only (`pending`/`sent-auto` skipped — they carry no
   * operator signal), counting leading `approved` until the first non-`approved`.
   * A `rejected` at the head returns 0 (the downgrade path).
   */
  async consecutiveApproved(
    integrationId: string,
    category: ReplyLedgerEntry["category"],
  ): Promise<number> {
    const entries = await this.listFiltered({ integrationId, category });
    const decided = entries
      .filter((e) => e.outcome === "approved" || e.outcome === "rejected" || e.outcome === "edited")
      .sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
    let count = 0;
    for (const entry of decided) {
      if (entry.outcome === "approved") count += 1;
      else break;
    }
    return count;
  }
}
