import { Injectable } from "@nestjs/common";
import type { ChannelItem, DraftResearch } from "@zibby/contracts";
import { LoggerService, type ScopedLogger } from "../../shared/logging/logger.service";
import { ChannelItemStore } from "../channel-item.store";
import { ChannelTriageFlowService } from "../channel-triage-flow.service";
import { ReplyDraftService } from "./reply-draft.service";

/** Researches per sweep. Bounded so a busy backlog cannot fork a process storm. */
const MAX_PER_SWEEP = 2;

/** Attempts before an item is surfaced notify-only instead of retried. */
const MAX_ATTEMPTS = 2;

/** A `pending` marker older than this is a crashed research, not a running one. */
const STALE_PENDING_MS = 15 * 60 * 1000;

/**
 * Turns `needs-draft` items into either a parked approval carrying a REAL answer,
 * or a notify-only surface. Mirrors the `sweepOutcomes()` pattern: the watcher
 * calls {@link sweep} once per tick, and every failure is contained.
 *
 * The `draftResearch.status = "pending"` write happens BEFORE the child process
 * spawns, which is what makes the sweep idempotent across ticks — a research
 * taking minutes is simply skipped by the next tick rather than double-spawned.
 *
 * An operator can dismiss an item at any moment, so the snapshot this service holds is
 * re-checked at BOTH ends of a research — once before the lock is written (the candidate
 * list ages while earlier candidates research) and once after the draft comes back. Each
 * door alone is insufficient: skip the first and the second reads a resurrection it
 * caused itself. A dismissed item must never be revived, let alone auto-replied to.
 *
 * Terminal `draftResearch` statuses (`ok`, and `failed` at the cap) are persisted BY the
 * hand-off, never before it — `isReady` never retries a terminal marker, so writing one
 * ahead of a throwing `parkOrSurface` would strand the item permanently. The item is left
 * on its pending lock instead and the staleness path picks it up again — bounded by
 * {@link MAX_ATTEMPTS}, so a hand-off that throws structurally (deleted integration,
 * missing credentials) is surfaced notify-only rather than researched forever.
 */
@Injectable()
export class ReplyDraftSweeperService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly store: ChannelItemStore,
    private readonly drafts: ReplyDraftService,
    private readonly flow: ChannelTriageFlowService,
    logger: LoggerService,
  ) {
    this.log = logger.child(ReplyDraftSweeperService.name);
  }

  /** One pass over the `needs-draft` backlog. Never throws. */
  async sweep(): Promise<void> {
    const candidates = (await this.store.list({ state: "needs-draft" })).filter((i) =>
      this.isReady(i),
    );
    for (const item of candidates.slice(0, MAX_PER_SWEEP)) {
      await this.researchOne(item).catch((err: unknown) => {
        this.log.warn("reply-draft sweep failed for item (continuing)", {
          itemId: item.id,
          error: (err as Error).message,
        });
      });
    }
  }

  /**
   * Ready = never attempted, retry budget left, or a crashed `pending` marker.
   *
   * A stale `pending` marker stays ready at ANY attempt count, deliberately: this is a
   * candidacy test, and an item dropped here has no other path out — it would sit on its
   * lock forever with no approval and no surface, silently. The retry budget is applied
   * to that path in {@link researchOne}, where the terminal alternative (a notify-only
   * surface) is actually reachable.
   */
  private isReady(item: ChannelItem): boolean {
    const r = item.draftResearch;
    if (!r) return true;
    if (r.status === "pending") return this.isStale(r);
    if (r.status === "ok") return false;
    return r.attempts < MAX_ATTEMPTS;
  }

  private isStale(r: DraftResearch): boolean {
    if (!r.startedAt) return true;
    return Date.now() - new Date(r.startedAt).getTime() > STALE_PENDING_MS;
  }

  private async researchOne(item: ChannelItem): Promise<void> {
    // The candidate list was snapshotted before the FIRST research of this sweep, and
    // researches run sequentially — so by this item's turn the snapshot can be minutes
    // old. Re-read before locking: building the lock from the stale copy would resurrect
    // an item the operator dismissed while an earlier candidate was researching, and the
    // post-research guard below would then read that resurrection and wave it through.
    const fresh = await this.store.findById(item.id);
    if (fresh?.state !== "needs-draft" || !this.isReady(fresh)) {
      this.log.debug("reply-draft research skipped: item is no longer a candidate", {
        itemId: item.id,
        state: fresh?.state ?? "deleted",
      });
      return;
    }

    // The retry cap on the STALE-PENDING path. A pending marker only survives its own
    // research when the hand-off threw (parkOrSurface persists every terminal marker, so
    // a completed one is never pending) — and a hand-off that throws for a STRUCTURAL
    // reason (a deleted integration, missing credentials on the Tier-2 sendReply leg)
    // throws every time. Without this, that item re-spawns a PAID 5-minute research every
    // STALE_PENDING_MS, forever, with nothing to show for it. At the budget, stop
    // researching and force the surface: telling the operator is the correct terminal
    // state for "we cannot hand this off". If the surface itself throws the item stays
    // pending and only the CHEAP surface is retried next sweep — never the research.
    const prior = fresh.draftResearch;
    if (prior?.status === "pending" && prior.attempts >= MAX_ATTEMPTS) {
      const capped: ChannelItem = {
        ...fresh,
        draftResearch: {
          status: "failed",
          attempts: prior.attempts,
          ...(prior.startedAt ? { startedAt: prior.startedAt } : {}),
          finishedAt: new Date().toISOString(),
          reason: `hand-off failed on all ${MAX_ATTEMPTS} attempts`,
        },
      };
      this.log.warn("reply-draft hand-off budget spent; surfacing notify-only", {
        itemId: fresh.id,
        attempts: prior.attempts,
      });
      await this.flow.parkOrSurface(capped, capped.triage, null);
      return;
    }

    const attempts = (fresh.draftResearch?.attempts ?? 0) + 1;
    // The in-flight lock: written BEFORE the spawn, so the next tick skips this item.
    const locked: ChannelItem = {
      ...fresh,
      draftResearch: { status: "pending", attempts, startedAt: new Date().toISOString() },
    };
    await this.store.update(locked);

    const draft = await this.drafts.research(locked);
    const finishedAt = new Date().toISOString();

    // Research takes minutes, and `locked` has been a stale snapshot the whole time.
    // The operator can dismiss an item in that window (`POST /items/:id/dismiss` takes
    // any state), so writing the snapshot back would resurrect a retired item — and
    // then hand it to parkOrSurface, which may AUTO-SEND a Tier-2 reply on something
    // the operator explicitly killed. Re-read and bail unless the item is still ours.
    const current = await this.store.findById(item.id);
    if (current?.state !== "needs-draft") {
      this.log.debug("reply-draft research discarded: item left needs-draft", {
        itemId: item.id,
        state: current?.state ?? "deleted",
      });
      return;
    }

    const startedAt = locked.draftResearch?.startedAt;

    if (draft) {
      const done: ChannelItem = {
        ...current,
        draftResearch: {
          status: "ok",
          attempts,
          ...(startedAt ? { startedAt } : {}),
          finishedAt,
        },
      };
      // The hand-off IS the persistence: every terminal branch of parkOrSurface spreads
      // the item into its own `store.update`, so the `ok` marker rides through with it.
      // Writing `ok` here first would be terminal — `isReady` never retries it — so a
      // parkOrSurface throw (deleted integration, missing credentials, approvals down)
      // would strand the item with no approval and no surface. Left on its pending lock
      // instead, the staleness path picks it up again.
      await this.flow.parkOrSurface(done, done.triage, draft);
      return;
    }

    const failed: ChannelItem = {
      ...current,
      draftResearch: {
        status: "failed",
        attempts,
        ...(startedAt ? { startedAt } : {}),
        finishedAt,
        reason: "no concrete answer from the repository",
      },
    };

    // Budget left → persist the retryable marker and stop. This one is safe to write:
    // `failed` under the cap is exactly what tells the next sweep to try again.
    if (attempts < MAX_ATTEMPTS) {
      await this.store.update(failed);
      return;
    }

    // Retry budget spent → surface it for the operator rather than retrying forever.
    // No draft means NO reply approval — a filler phrase is never substituted. Same
    // rule as above: the terminal marker is persisted by the hand-off, not before it.
    await this.flow.parkOrSurface(failed, failed.triage, null);
  }
}
