import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  type HandoffSignalKind,
  type HandoffSignalKindInput,
  HandoffSignalKindSchema,
} from "@zibby/contracts";
import { z } from "zod";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { SignalKindNotFoundError, SystemSignalKindError } from "./handoff-signal-kind.errors";

/** DI token for the single signal-kinds JSON file. */
export const HANDOFF_SIGNAL_KINDS_FILE = "HANDOFF_SIGNAL_KINDS_FILE";

const SignalKindListSchema = z.array(HandoffSignalKindSchema);

/**
 * The B1 seed table (design doc
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`,
 * Slot B → B1): the 7 signal kinds the 4 existing producers already emit —
 * Sentinel (`cve`/`secret`), Maestro (`post-merge-red`), Loom
 * (`god-node`/`community`/`cycle`), Scout (`research-artifact`). Labels/
 * descriptions are the canonical English strings from
 * `apps/web/i18n/messages/en.json`'s `subsystems.handoff.signalKind[Desc]` keys,
 * kept verbatim so server and web agree. `severityBearing` is verified against
 * each producer's actual `toSignal`/`evaluate` call site, not assumed: ONLY
 * `cve` (`sentinel.service.ts`'s `toSignal`, via `SEVERITY_MAP`) sets
 * `HandoffSignal.severity` — `secret` (same file), `post-merge-red`
 * (`post-merge-watch.service.ts`'s `dispatchFix`), and all three Loom kinds
 * (`loom.service.ts`'s `toSignal`) and `research-artifact`
 * (`pipeline-runner.service.ts`'s Scout delivery hook) omit it entirely.
 */
export const SYSTEM_SIGNAL_KINDS: readonly HandoffSignalKind[] = [
  {
    id: "cve",
    from: "sentinel",
    label: "Vulnerability (CVE)",
    description: "A vulnerability found in a project dependency.",
    severityBearing: true,
    status: "builtin",
    system: true,
  },
  {
    id: "secret",
    from: "sentinel",
    label: "Leaked secret",
    description: "A secret key or password leaked in code.",
    severityBearing: false,
    status: "builtin",
    system: true,
  },
  {
    id: "post-merge-red",
    from: "maestro",
    label: "Red CI after merge",
    description: "CI failed after a PR was merged.",
    severityBearing: false,
    status: "builtin",
    system: true,
  },
  {
    id: "god-node",
    from: "loom",
    label: "Graph god-node",
    description: "A highly connected node in the code graph.",
    severityBearing: false,
    status: "builtin",
    system: true,
  },
  {
    id: "community",
    from: "loom",
    label: "Graph community",
    description: "A newly detected community in the graph.",
    severityBearing: false,
    status: "builtin",
    system: true,
  },
  {
    id: "cycle",
    from: "loom",
    label: "Dependency cycle",
    description: "A cyclic dependency between modules.",
    severityBearing: false,
    status: "builtin",
    system: true,
  },
  {
    id: "research-artifact",
    from: "scout",
    label: "Research artifact",
    description: "A completed research artifact.",
    severityBearing: false,
    status: "builtin",
    system: true,
  },
] as const;

/**
 * B1 — the handoff signal-kind registry (design doc, Slot B → B1): a single
 * file-backed JSON array (`.zibby/data/handoff/signal-kinds.json`), modeled
 * directly on `HandoffRuleStore`. Seeded with {@link SYSTEM_SIGNAL_KINDS} on
 * first boot; a missing OR corrupt file re-seeds the defaults (fail-open —
 * never throws). `create` mints an id by slugifying the label, always forces
 * `status: "pending"` and `system: false` (an operator create is never a
 * built-in, regardless of what the input carries); `update` preserves the
 * stored `status`/`system`/`buildTaskId` verbatim; `delete`/`update` on a
 * `system: true` row throws {@link SystemSignalKindError}. `markBuildTask`
 * links a freshly-created kind to the Forge build task the service (B1's
 * `SignalKindService`) spawns for it.
 */
@Injectable()
export class HandoffSignalKindStore implements OnModuleInit {
  private readonly file: string;
  private readonly log: ScopedLogger;

  constructor(@Inject(HANDOFF_SIGNAL_KINDS_FILE) file: string, logger: LoggerService) {
    this.file = path.resolve(file);
    this.log = logger.child(HandoffSignalKindStore.name);
  }

  async onModuleInit(): Promise<void> {
    await this.seedSystem();
  }

  /** All signal kinds (built-in + operator-registered), in on-disk order. */
  async list(): Promise<HandoffSignalKind[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = SignalKindListSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      this.log.warn("corrupt handoff signal-kinds file — treating as empty (fail-open)");
      return [];
    }
    return parsed.data;
  }

  /**
   * Register a new operator-authored signal kind. The id is minted by
   * slugifying `input.label` (lowercase, non-alphanumeric → `-`, collapsed/
   * trimmed dashes); a collision with an existing id is disambiguated with a
   * numeric `-2`, `-3`, … suffix. `status` is always forced to `"pending"` and
   * `system` to `false`.
   */
  async create(input: HandoffSignalKindInput): Promise<HandoffSignalKind> {
    const kinds = await this.list();
    const id = uniqueSlug(input.label, new Set(kinds.map((k) => k.id)));
    const kind: HandoffSignalKind = { ...input, id, status: "pending", system: false };
    await this.write([...kinds, kind]);
    return kind;
  }

  /**
   * Replace a signal kind's editable fields in place (keeps its id). The
   * stored `status`/`system`/`buildTaskId` are PRESERVED from the existing
   * row and can never be changed by the input. A `system: true` row refuses
   * with {@link SystemSignalKindError} (built-ins are view-only).
   */
  async update(id: string, input: HandoffSignalKindInput): Promise<HandoffSignalKind> {
    const kinds = await this.list();
    const index = kinds.findIndex((k) => k.id === id);
    if (index === -1) throw new SignalKindNotFoundError(id);
    const existing = kinds[index];
    if (!existing) throw new SignalKindNotFoundError(id);
    if (existing.system === true) throw new SystemSignalKindError(id);
    const updated: HandoffSignalKind = {
      ...input,
      id,
      status: existing.status,
      system: existing.system ?? false,
      ...(existing.buildTaskId ? { buildTaskId: existing.buildTaskId } : {}),
    };
    const next = [...kinds];
    next[index] = updated;
    await this.write(next);
    return updated;
  }

  /** Remove an operator-registered signal kind. A built-in throws {@link SystemSignalKindError}. */
  async delete(id: string): Promise<void> {
    const kinds = await this.list();
    const existing = kinds.find((k) => k.id === id);
    if (!existing) throw new SignalKindNotFoundError(id);
    if (existing.system === true) throw new SystemSignalKindError(id);
    await this.write(kinds.filter((k) => k.id !== id));
  }

  /** Link a signal kind to its Forge build task id (set once, right after `create`). */
  async markBuildTask(id: string, buildTaskId: string): Promise<void> {
    const kinds = await this.list();
    const index = kinds.findIndex((k) => k.id === id);
    if (index === -1) throw new SignalKindNotFoundError(id);
    const existing = kinds[index];
    if (!existing) throw new SignalKindNotFoundError(id);
    const next = [...kinds];
    next[index] = { ...existing, buildTaskId };
    await this.write(next);
  }

  /**
   * Missing file, or one that fails to parse as a valid signal-kind array, is
   * (re)seeded with the built-in defaults. A present, valid file is left
   * untouched — this only ever fires on a fresh/corrupt file, never clobbering
   * live operator edits.
   */
  private async seedSystem(): Promise<void> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw !== null && SignalKindListSchema.safeParse(safeJson(raw)).success) return;
    if (raw !== null) this.log.warn("corrupt handoff signal-kinds file — reseeding defaults");
    await this.write([...SYSTEM_SIGNAL_KINDS]);
  }

  private async write(kinds: HandoffSignalKind[]): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(kinds, null, 2)}\n`);
  }
}

/** Lowercase, non-alphanumeric → `-`, collapsed/trimmed dashes; disambiguated on collision. */
function uniqueSlug(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "signal";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
