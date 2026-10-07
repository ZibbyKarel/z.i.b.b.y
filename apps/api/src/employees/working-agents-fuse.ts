import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { SystemConfigStore } from "../system/system-config.store";
import { GrantQueue, type GrantRank } from "./grant-order";

/** A held fuse slot; calling it releases the slot (idempotent). */
export type FuseSlot = () => void;

/**
 * The machine fuse (docs/plans/zibbycorp/staffing-driven-capacity.md, decision 2):
 * at most `systemConfig.maxWorkingAgents` agents started by the task system work at
 * once — a single-agent / orchestrator task run holds a slot for its lifetime, a
 * workflow agent stage holds one per stage. Goal-loop iterations, chat and
 * channel-triage agents are not task work and are not counted. A queued task holds no
 * slot; a single-agent / orchestrator run holds its slot until a terminal status,
 * including `awaiting-approval` / `paused-limit`. Waiters are granted in the shared
 * {@link GrantQueue} order; the cap is read live, so a raised cap admits waiters
 * immediately.
 *
 * ponytail: in-memory count — a run that survives an API restart is not counted until
 * it ends, so the fuse can briefly over-admit after a reboot; rebuild `held` from the
 * runners' live registries at boot if that ever matters.
 */
@Injectable()
export class WorkingAgentsFuse implements OnModuleDestroy {
  private held = 0;
  private readonly queue = new GrantQueue<() => void>();
  private readonly freedListeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  constructor(private readonly systemConfig: SystemConfigStore) {
    // A raised cap must admit waiters immediately, no restart.
    this.unsubscribe = systemConfig.onChange(() => this.pump());
  }

  onModuleDestroy(): void {
    this.unsubscribe();
  }

  inUse(): number {
    return this.held;
  }

  /** True when a slot would be granted right now: nobody waiting and under the cap. */
  hasRoom(): boolean {
    return this.queue.size === 0 && this.held < this.cap();
  }

  tryTake(rank: GrantRank = {}): FuseSlot | null {
    if (!this.hasRoom()) return null;
    this.queue.noteGrant(rank.projectId);
    this.held += 1;
    return this.slot();
  }

  /** Take a slot, waiting (ranked) when the fuse is full. */
  take(rank: GrantRank = {}): Promise<FuseSlot> {
    const slot = this.tryTake(rank);
    if (slot) return Promise.resolve(slot);
    return new Promise((resolve) => this.queue.enqueue(rank, () => resolve(this.slot())));
  }

  /** Subscribe to "room exists" after a release or a cap raise; returns the unsubscribe. */
  onFreed(listener: () => void): () => void {
    this.freedListeners.add(listener);
    return () => this.freedListeners.delete(listener);
  }

  private cap(): number {
    return this.systemConfig.current().maxWorkingAgents;
  }

  private slot(): FuseSlot {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held -= 1;
      this.pump();
    };
  }

  private pump(): void {
    while (this.queue.size > 0 && this.held < this.cap()) {
      this.held += 1;
      this.queue.shift()!();
    }
    if (this.hasRoom()) for (const listener of this.freedListeners) listener();
  }
}
