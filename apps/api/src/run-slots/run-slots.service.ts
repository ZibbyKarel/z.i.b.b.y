import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { SystemConfigStore } from "../system/system-config.store";

/** A held run slot; calling it releases the slot (idempotent). */
export type RunSlot = () => void;

/**
 * The only concurrency throttle (docs/plans/remove-employees.md, decision 2): one
 * slot per run instance the task system starts — a single-agent, orchestrator,
 * workflow or goal run, however many agents it spawns inside. At most
 * `systemConfig.maxConcurrentRuns` runs hold a slot at once, and at most the
 * project's `budget.maxConcurrent` (when set) inside one project. A run holds its
 * slot until its terminal status, including while it waits on an approval. Nothing
 * waits here: a dispatch that finds no room is queued by the scheduler, which
 * re-drains on {@link onFreed}. The global cap is read live, so a raised cap
 * admits queued work immediately.
 *
 * ponytail: in-memory count — a run that survives an API restart (a parked
 * workflow) is not counted until it ends, so the limit can briefly over-admit
 * after a reboot; rebuild `held` from the runners' registries at boot if that
 * ever matters.
 */
@Injectable()
export class RunSlots implements OnModuleDestroy {
  private held = 0;
  /** projectId → slots held inside that project. */
  private readonly perProject = new Map<string, number>();
  private readonly freedListeners = new Set<() => void>();
  private readonly unsubscribe: () => void;

  constructor(private readonly systemConfig: SystemConfigStore) {
    this.unsubscribe = systemConfig.onChange(() => this.notifyFreed());
  }

  onModuleDestroy(): void {
    this.unsubscribe();
  }

  inUse(projectId?: string): number {
    return projectId === undefined ? this.held : (this.perProject.get(projectId) ?? 0);
  }

  /**
   * True when a run could start now: under the global cap and, for a project with
   * a `projectCap`, under that too.
   */
  hasRoom(projectId?: string, projectCap?: number): boolean {
    if (this.held >= this.systemConfig.current().maxConcurrentRuns) return false;
    return (
      projectId === undefined || projectCap === undefined || this.inUse(projectId) < projectCap
    );
  }

  tryTake(projectId?: string, projectCap?: number): RunSlot | null {
    if (!this.hasRoom(projectId, projectCap)) return null;
    this.held += 1;
    if (projectId !== undefined) this.perProject.set(projectId, this.inUse(projectId) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held -= 1;
      if (projectId !== undefined) {
        const left = this.inUse(projectId) - 1;
        if (left > 0) this.perProject.set(projectId, left);
        else this.perProject.delete(projectId);
      }
      this.notifyFreed();
    };
  }

  /** Subscribe to "a slot freed or the cap changed"; returns the unsubscribe. */
  onFreed(listener: () => void): () => void {
    this.freedListeners.add(listener);
    return () => this.freedListeners.delete(listener);
  }

  private notifyFreed(): void {
    for (const listener of this.freedListeners) listener();
  }
}
