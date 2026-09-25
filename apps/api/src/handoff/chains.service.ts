import { Injectable } from "@nestjs/common";
import type { Chain, ChainInput, HandoffSignalKind, ScheduledTask } from "@zibby/contracts";
import { withPathLock } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { chainToRules, deriveChain, validateChainInput } from "./chain-view";
import { ChainInUseError, ChainNotFoundError, InvalidChainInputError } from "./chain.errors";
import { HandoffRuleStore } from "./handoff-rule.store";
import { HandoffSignalKindStore } from "./handoff-signal-kind.store";

/** A parent task still walking `chainId`'s route — blocks a delete (409). */
function isActiveChainParent(task: ScheduledTask, chainId: string): boolean {
  if (task.target?.kind !== "chain" || task.target.id !== chainId) return false;
  if (task.chainEndedAt) return false;
  if (task.status === "failed" || task.status === "cancelled") return false;
  if (task.outcome?.status === "error") return false;
  return true;
}

/**
 * ZB-05a / D-005 — chain CRUD: a chain is a VIEW over the existing
 * `HandoffSignalKindStore` (its metadata row, `chain: true`) + `HandoffRuleStore`
 * (its route, as rules), never a separate store (`chain-view.ts`). `put`/`delete`
 * touch BOTH stores, so both are serialized under one lock keyed on the chain id
 * — a `put` that fails writing the rules half rolls the kind back to what it was.
 */
@Injectable()
export class ChainsService {
  private readonly log: ScopedLogger;

  constructor(
    private readonly signalKinds: HandoffSignalKindStore,
    private readonly rules: HandoffRuleStore,
    private readonly tasks: ScheduledTasksStorageService,
    logger: LoggerService,
  ) {
    this.log = logger.child(ChainsService.name);
  }

  async list(): Promise<Chain[]> {
    const [kinds, rules] = await Promise.all([this.signalKinds.list(), this.rules.list()]);
    const chains: Chain[] = [];
    for (const kind of kinds) {
      const chain = deriveChain(kind, rules);
      if (chain) chains.push(chain);
    }
    return chains;
  }

  async get(id: string): Promise<Chain> {
    const [kind, rules] = await Promise.all([this.signalKinds.getRaw(id), this.rules.list()]);
    const chain = kind && deriveChain(kind, rules);
    if (!chain) throw new ChainNotFoundError(id);
    return chain;
  }

  /** Create or replace: atomically rewrites the kind AND exactly its own rules. */
  async put(id: string, input: ChainInput): Promise<Chain> {
    const problem = validateChainInput(input);
    if (problem) throw new InvalidChainInputError(problem);
    return withPathLock(`handoff-chain:${id}`, async () => {
      const previousKind = await this.signalKinds.getRaw(id);
      const kind: HandoffSignalKind = {
        id,
        from: input.entry,
        label: input.label,
        description: input.description,
        severityBearing: false,
        status: previousKind?.status ?? "active",
        chain: true,
        entry: input.entry,
      };
      await this.signalKinds.upsertChainKind(kind);
      const newRules = chainToRules(id, input);
      try {
        await this.rules.replaceForSignalKind(id, newRules);
      } catch (error) {
        // Roll back the kind half — nothing durable should half-apply.
        if (previousKind) {
          await this.signalKinds.upsertChainKind(previousKind).catch(() => {});
        } else {
          await this.signalKinds.deleteChainKind(id).catch(() => {});
        }
        this.log.warn("chain PUT rolled back — rules write failed", {
          id,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      const chain = deriveChain(kind, newRules);
      // deriveChain only returns null for a non-chain / entry-less kind — impossible
      // here, `kind` was just built with `chain: true` and a real `entry`.
      return chain as Chain;
    });
  }

  async delete(id: string): Promise<void> {
    return withPathLock(`handoff-chain:${id}`, async () => {
      const kind = await this.signalKinds.getRaw(id);
      if (!kind || kind.chain !== true) throw new ChainNotFoundError(id);
      const tasks = await this.tasks.list().catch((): ScheduledTask[] => []);
      if (tasks.some((t) => isActiveChainParent(t, id))) throw new ChainInUseError(id);
      await this.rules.replaceForSignalKind(id, []);
      await this.signalKinds.deleteChainKind(id);
    });
  }
}
