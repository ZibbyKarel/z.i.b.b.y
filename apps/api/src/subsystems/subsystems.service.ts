import { Injectable } from "@nestjs/common";
import { SUBSYSTEMS, type Subsystem, type SubsystemWithStatus } from "@zibby/contracts";
import { SubsystemNotFoundError } from "./subsystems.errors";

/**
 * Phase 80 — thin: maps the fixed `SUBSYSTEMS` registry (`@zibby/contracts`) to
 * with-status entries carrying the phase-80 stub status (`state: "klid"`, zero
 * Tier-2/Tier-3 counts). Real aggregation across running pipelines/goals/approvals
 * lands in phase 82; the shape is stable now so the web query never has to change.
 */
@Injectable()
export class SubsystemsService {
  private withStatus(subsystem: Subsystem): SubsystemWithStatus {
    return { ...subsystem, state: "klid", tier2Count: 0, tier3Count: 0 };
  }

  /** All eight subsystems, in registry order, each with the stub status. */
  list(): SubsystemWithStatus[] {
    return SUBSYSTEMS.map((subsystem) => this.withStatus(subsystem));
  }

  /** A single subsystem by id; throws `SubsystemNotFoundError` for an unknown id. */
  get(id: string): SubsystemWithStatus {
    const subsystem = SUBSYSTEMS.find((s) => s.id === id);
    if (!subsystem) throw new SubsystemNotFoundError(id);
    return this.withStatus(subsystem);
  }
}
