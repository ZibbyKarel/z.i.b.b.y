import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { MachineAction, MachineActionRecord, RenamePreviewEntry } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { MachineActionStore } from "./machine-action.store";

/** Propose-time validation failure — the controller maps it to a 422. */
export class MachineActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachineActionRejectedError";
  }
}

/**
 * Controlling the machine (N5a) — the {@link ResumableRunner} for the `machine`
 * approval kind, on the jira-issue seam: {@link propose} NEVER touches the disk
 * beyond reading — it computes the dry-run preview, persists the durable record
 * and parks a Tier-3 approval; {@link resume} (the operator's approve) executes
 * the persisted preview exactly once; {@link cancel} (reject) marks the record
 * and leaves the disk untouched. Every guard fails closed: a bad folder, a path
 * separator in find/replace, an empty preview or a target collision refuses the
 * proposal outright, and execution re-verifies each rename before performing it.
 */
@Injectable()
export class MachineService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;

  constructor(
    private readonly store: MachineActionStore,
    private readonly approvals: ApprovalsService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(MachineService.name);
  }

  onModuleInit(): void {
    this.approvals.register("machine", this);
  }

  /** Park a machine action behind a Tier-3 approval; returns the durable record. */
  async propose(action: MachineAction): Promise<MachineActionRecord> {
    const preview = await this.previewRenames(action);
    const record: MachineActionRecord = {
      id: `machine-${Date.now()}-${randomUUID().slice(0, 8)}`,
      action,
      preview,
      state: "proposed",
      requestedAt: new Date().toISOString(),
    };
    await this.store.put(record);
    const approval = await this.approvals.requestApproval({
      runId: record.id,
      kind: "machine",
      skill: "machine",
      action: "fs.rename",
      detail:
        `${action.folder}: ${preview.length} file(s), "${action.find}" → "${action.replace}"\n` +
        preview.map((p) => `${p.from} → ${p.to}`).join("\n"),
      risk: "high",
    });
    const updated = await this.store.put({ ...record, approvalId: approval.id });
    this.log.info("machine action parked for approval", {
      id: record.id,
      approvalId: approval.id,
      files: preview.length,
    });
    return updated;
  }

  /** Approve → execute the persisted preview exactly once (fail-closed, never throws out). */
  async resume(runId: string): Promise<void> {
    const record = await this.store.get(runId).catch(() => null);
    if (!record || record.state !== "proposed") {
      // Idempotent + fail-closed: a lost record or repeated decision executes nothing.
      this.log.warn("machine resume skipped (no proposed record)", { runId });
      return;
    }
    const folder = record.action.folder;
    try {
      for (const entry of record.preview) {
        const from = path.join(folder, entry.from);
        const to = path.join(folder, entry.to);
        // Re-verify right before acting — the world may have moved since the preview.
        await fs.access(from);
        const targetTaken = await fs.access(to).then(
          () => true,
          () => false,
        );
        if (targetTaken) throw new Error(`target already exists: ${entry.to}`);
        await fs.rename(from, to);
      }
      await this.store.put({ ...record, state: "executed", executedAt: new Date().toISOString() });
      void this.activity.record({
        kind: "machine-action",
        summary: `renamed ${record.preview.length} file(s) in ${folder} ("${record.action.find}" → "${record.action.replace}")`,
        refs: { runRef: record.id, action: "fs.rename", status: "executed" },
      });
      this.log.info("machine action executed", { id: record.id, files: record.preview.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.store.put({ ...record, state: "failed", error: message });
      void this.activity.record({
        kind: "machine-action",
        summary: `machine action failed in ${folder}: ${message}`,
        refs: { runRef: record.id, action: "fs.rename", status: "failed" },
      });
      this.log.warn("machine action failed", { id: record.id, error: message });
    }
  }

  /** Reject → record it; the disk was never touched. */
  cancel(runId: string): void {
    void this.store
      .get(runId)
      .then((record) =>
        record.state === "proposed" ? this.store.put({ ...record, state: "rejected" }) : record,
      )
      .catch(() => {
        this.log.warn("machine cancel skipped (no record)", { runId });
      });
  }

  /**
   * Dry-run: compute the rename plan without touching anything. Guards fail
   * closed — see {@link MachineActionRejectedError} call sites.
   */
  private async previewRenames(action: MachineAction): Promise<RenamePreviewEntry[]> {
    const { folder, find, replace } = action;
    if (!path.isAbsolute(folder)) {
      throw new MachineActionRejectedError(`folder must be an absolute path: ${folder}`);
    }
    const stat = await fs.stat(folder).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new MachineActionRejectedError(`folder does not exist or is not a directory: ${folder}`);
    }
    // Renames operate on basenames only — a separator would let a name escape the folder.
    if (/[/\\]/.test(find) || /[/\\]/.test(replace)) {
      throw new MachineActionRejectedError("find/replace must not contain path separators");
    }

    const entries = await fs.readdir(folder, { withFileTypes: true });
    const preview: RenamePreviewEntry[] = entries
      .filter((e) => e.isFile() && e.name.includes(find))
      .map((e) => ({ from: e.name, to: e.name.replaceAll(find, replace) }))
      .filter((p) => p.from !== p.to);

    if (preview.length === 0) {
      throw new MachineActionRejectedError(`no file names in ${folder} contain "${find}"`);
    }
    const existing = new Set(entries.map((e) => e.name));
    const targets = new Set<string>();
    for (const p of preview) {
      if (targets.has(p.to) || (existing.has(p.to) && !preview.some((q) => q.from === p.to))) {
        throw new MachineActionRejectedError(`rename collision on target: ${p.to}`);
      }
      targets.add(p.to);
    }
    return preview;
  }
}
