import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import type {
  MachineAction,
  MachineActionRecord,
  RenameFilesAction,
  RenamePreviewEntry,
  Risk,
} from "@zibby/contracts";
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
/**
 * Open a URL or a plain filesystem path on the operator's machine (macOS
 * `open`, which handles both a `maps://` URL and a directory path the same
 * way); tests inject a stub so nothing actually launches.
 */
export type UrlOpener = (target: string) => Promise<void>;

const defaultOpener: UrlOpener = async (url) => {
  await promisify(execFile)("open", [url]);
};

@Injectable()
export class MachineService implements OnModuleInit, ResumableRunner {
  private readonly log: ScopedLogger;
  private readonly opener: UrlOpener;

  constructor(
    private readonly store: MachineActionStore,
    private readonly approvals: ApprovalsService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
    // Optional so Nest doesn't DI-resolve it — production uses the real `open`;
    // tests inject a stub so nothing launches (the jira-adapter pattern).
    @Optional() opener?: UrlOpener,
  ) {
    this.log = logger.child(MachineService.name);
    this.opener = opener ?? defaultOpener;
  }

  onModuleInit(): void {
    this.approvals.register("machine", this);
  }

  /** Park a machine action behind a Tier-3 approval; returns the durable record. */
  async propose(action: MachineAction): Promise<MachineActionRecord> {
    const plan = await this.plan(action);
    const record: MachineActionRecord = {
      id: `machine-${Date.now()}-${randomUUID().slice(0, 8)}`,
      action,
      preview: plan.preview,
      state: "proposed",
      requestedAt: new Date().toISOString(),
    };
    await this.store.put(record);
    const approval = await this.approvals.requestApproval({
      runId: record.id,
      kind: "machine",
      skill: "machine",
      action: plan.gateAction,
      detail: plan.detail,
      risk: plan.risk,
    });
    const updated = await this.store.put({ ...record, approvalId: approval.id });
    this.log.info("machine action parked for approval", {
      id: record.id,
      approvalId: approval.id,
      kind: action.kind,
    });
    return updated;
  }

  /** Per-kind dry-run: what would happen, what the gate shows, how risky it reads. */
  private async plan(
    action: MachineAction,
  ): Promise<{ preview: RenamePreviewEntry[]; gateAction: string; detail: string; risk: Risk }> {
    switch (action.kind) {
      case "rename-files": {
        const preview = await this.previewRenames(action);
        return {
          preview,
          gateAction: "fs.rename",
          detail:
            `${action.folder}: ${preview.length} file(s), "${action.find}" → "${action.replace}"\n` +
            preview.map((p) => `${p.from} → ${p.to}`).join("\n"),
          risk: "high",
        };
      }
      case "open-maps":
        // Only opens a window — reversible, low risk — but still gated: nothing
        // executes on the operator's machine silently.
        return {
          preview: [],
          gateAction: "maps.open",
          detail: `Open Maps: "${action.query}"`,
          risk: "low",
        };
      case "open-folder": {
        // Nothing to preview — the dry-run IS the existence check (fail-closed,
        // same shape as previewRenames): a bad path refuses the proposal outright.
        await this.assertOpenableFolder(action.path);
        return {
          preview: [],
          gateAction: "fs.open",
          detail: `Open folder: ${action.path}`,
          risk: "low",
        };
      }
    }
  }

  /** Approve → execute the persisted preview exactly once (fail-closed, never throws out). */
  async resume(runId: string): Promise<void> {
    const record = await this.store.get(runId).catch(() => null);
    if (!record || record.state !== "proposed") {
      // Idempotent + fail-closed: a lost record or repeated decision executes nothing.
      this.log.warn("machine resume skipped (no proposed record)", { runId });
      return;
    }
    try {
      const summary = await this.execute(record);
      await this.store.put({ ...record, state: "executed", executedAt: new Date().toISOString() });
      void this.activity.record({
        kind: "machine-action",
        summary,
        refs: { runRef: record.id, action: record.action.kind, status: "executed" },
      });
      this.log.info("machine action executed", { id: record.id, kind: record.action.kind });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.store.put({ ...record, state: "failed", error: message });
      void this.activity.record({
        kind: "machine-action",
        summary: `machine action ${record.action.kind} failed: ${message}`,
        refs: { runRef: record.id, action: record.action.kind, status: "failed" },
      });
      this.log.warn("machine action failed", { id: record.id, error: message });
    }
  }

  /** Perform the approved action; returns the activity summary line. */
  private async execute(record: MachineActionRecord): Promise<string> {
    const { action } = record;
    switch (action.kind) {
      case "rename-files": {
        for (const entry of record.preview) {
          const from = path.join(action.folder, entry.from);
          const to = path.join(action.folder, entry.to);
          // Re-verify right before acting — the world may have moved since the preview.
          await fs.access(from);
          const targetTaken = await fs.access(to).then(
            () => true,
            () => false,
          );
          if (targetTaken) throw new Error(`target already exists: ${entry.to}`);
          await fs.rename(from, to);
        }
        return `renamed ${record.preview.length} file(s) in ${action.folder} ("${action.find}" → "${action.replace}")`;
      }
      case "open-maps": {
        await this.opener(`maps://?q=${encodeURIComponent(action.query)}`);
        return `opened Maps for "${action.query}"`;
      }
      case "open-folder": {
        // Re-verify right before acting — the folder may have been moved/deleted
        // since the preview (same fail-closed discipline as the rename re-check).
        await this.assertOpenableFolder(action.path);
        await this.opener(action.path);
        return `opened folder ${action.path}`;
      }
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
  private async previewRenames(action: RenameFilesAction): Promise<RenamePreviewEntry[]> {
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

  /**
   * Fail-closed existence check for `open-folder` — an absolute path to an
   * existing directory, nothing else; used both at propose time (the dry-run)
   * and again right before execute (the world may have moved in between).
   */
  private async assertOpenableFolder(folderPath: string): Promise<void> {
    if (!path.isAbsolute(folderPath)) {
      throw new MachineActionRejectedError(`path must be an absolute path: ${folderPath}`);
    }
    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat?.isDirectory()) {
      throw new MachineActionRejectedError(
        `path does not exist or is not a directory: ${folderPath}`,
      );
    }
  }
}
