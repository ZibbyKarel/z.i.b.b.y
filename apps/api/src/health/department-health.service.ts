import { Injectable } from "@nestjs/common";
import type { DepartmentHealth } from "@zibby/contracts";
import { SchedulerService } from "../automations/scheduler.service";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { VaultService } from "../memory/vault.service";

/**
 * Per-department health probes (M8 — "never fail silently"). Each probe is cheap and
 * defensive: it can only resolve to a {@link DepartmentHealth}, never throw, so one
 * unreachable department degrades only its own line. The overall readiness status is
 * composed by the controller (degraded if any department is not `ok`).
 */
@Injectable()
export class DepartmentHealthService {
  constructor(
    private readonly vault: VaultService,
    private readonly integrations: IntegrationsStorageService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** Probe every department concurrently. Backend is up by definition (it answered). */
  async probeAll(): Promise<DepartmentHealth[]> {
    const [vault, integrations] = await Promise.all([this.probeVault(), this.probeIntegrations()]);
    return [{ name: "backend", status: "ok" }, vault, integrations, this.probeScheduler()];
  }

  /** Vault is healthy if its index is readable (the dir exists + parses). */
  private async probeVault(): Promise<DepartmentHealth> {
    try {
      await this.vault.index();
      return { name: "vault", status: "ok" };
    } catch (error) {
      return { name: "vault", status: "down", detail: reason(error) };
    }
  }

  /** Integrations storage is healthy if the registry is listable. */
  private async probeIntegrations(): Promise<DepartmentHealth> {
    try {
      await this.integrations.list();
      return { name: "integrations", status: "ok" };
    } catch (error) {
      return { name: "integrations", status: "down", detail: reason(error) };
    }
  }

  /**
   * Scheduler is `ok` when the tick loop is armed, `ok` (with a note) when the loop
   * is intentionally disabled (`tickMs <= 0`, the test/CI mode), and `degraded` only
   * when it was configured to run but failed to arm — the genuine fault.
   */
  private probeScheduler(): DepartmentHealth {
    const h = this.scheduler.health();
    if (h.running) {
      return {
        name: "scheduler",
        status: "ok",
        ...(h.lastTickAt ? { detail: `last tick ${h.lastTickAt}` } : {}),
      };
    }
    if (h.tickMs <= 0)
      return { name: "scheduler", status: "ok", detail: "tick loop disabled (driven manually)" };
    return {
      name: "scheduler",
      status: "degraded",
      detail: "tick loop configured but not running",
    };
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
