import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import { type GateRule, GateRuleSchema, type MatchCondition } from "@zibby/contracts";
import matter from "gray-matter";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { DECISION_RANK } from "./decision-rank";

/** DI token for the directory holding the locked system policy floor (`POLICY.md`). */
export const POLICY_DIR = "POLICY_DIR";

const FILE = "POLICY.md";

/**
 * The system policy floor: a single locked `POLICY.md` whose frontmatter carries
 * `policy: GateRule[]`. It is the structural enforcement of "ZIBBY never
 * autonomously completes a transactional action" — agents may only *harden* it.
 * Storage-service pattern: tolerant parse (a single malformed rule is dropped, not
 * the whole floor), seeded with a conservative default on first run.
 */
@Injectable()
export class PolicyStorageService implements OnModuleInit {
  private readonly dir: string;
  private readonly log?: ScopedLogger;

  constructor(
    @Inject(POLICY_DIR) dir: string,
    // Optional so unit tests can `new PolicyStorageService(dir)`; in the running
    // app the global LoggingModule always supplies it.
    @Optional() logger?: LoggerService,
  ) {
    this.dir = path.resolve(dir);
    this.log = logger?.child(PolicyStorageService.name);
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    if (!(await this.exists())) await this.seed();
  }

  /**
   * The locked floor rules. Always tagged `source: "system", locked: true`.
   *
   * A union-merge of whatever is on disk with the canonical {@link DEFAULT_FLOOR}
   * (keyed by each rule's primary `action` match condition), taking the STRICTER
   * decision per action — never the raw disk list. Disk may add new floor rules
   * (any action `DEFAULT_FLOOR` doesn't cover) or harden an existing one; it can
   * never silently weaken a canonical floor entry. This is what keeps the floor an
   * enforced MINIMUM rather than a mere empty-file fallback: a drifted or
   * hand-edited `POLICY.md` self-heals back up to canonical strength on every
   * read, with no migration step.
   */
  async floor(): Promise<GateRule[]> {
    const disk = await this.readDiskRules();
    return this.mergeWithDefaultFloor(disk);
  }

  /** The raw, tolerantly-parsed disk rules — `[]` if the file is missing, unparsable,
   * or empty. No `DEFAULT_FLOOR` fallback here; {@link floor} always merges. */
  private async readDiskRules(): Promise<GateRule[]> {
    const raw = await fs.readFile(path.join(this.dir, FILE), "utf8").catch(() => null);
    if (raw === null) return [];
    let data: Record<string, unknown>;
    try {
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      return [];
    }
    const list = Array.isArray(data.policy) ? data.policy : [];
    const rules: GateRule[] = [];
    for (const item of list) {
      // Force the locked-system provenance regardless of what's on disk.
      const parsed = GateRuleSchema.safeParse({
        ...(item as object),
        source: "system",
        locked: true,
      });
      if (parsed.success) rules.push(parsed.data);
    }
    return rules;
  }

  /** Union-merge: start from canonical, let disk add new actions or harden known
   * ones; drop (with a warning) any disk rule that would weaken a known one. */
  private mergeWithDefaultFloor(disk: GateRule[]): GateRule[] {
    const merged: GateRule[] = [...DEFAULT_FLOOR];
    for (const rule of disk) {
      const key = primaryAction(rule);
      const idx = key === undefined ? -1 : merged.findIndex((c) => primaryAction(c) === key);
      if (idx === -1) {
        merged.push(rule); // disk-only addition: a new floor action, always fine.
        continue;
      }
      const canonical = merged[idx];
      if (canonical === undefined) continue;
      if (DECISION_RANK[rule.decision] >= DECISION_RANK[canonical.decision]) {
        merged[idx] = rule; // disk matches or hardens canonical: keep disk's (may carry a custom resolve).
      } else {
        this.log?.warn("policy floor drift: disk rule weaker than the canonical minimum, ignoring", {
          action: key,
          diskDecision: rule.decision,
          canonicalDecision: canonical.decision,
        });
      }
    }
    return merged;
  }

  private async exists(): Promise<boolean> {
    return fs
      .access(path.join(this.dir, FILE))
      .then(() => true)
      .catch(() => false);
  }

  private async seed(): Promise<void> {
    const body = matter.stringify("\nSystem policy floor. Agents may only harden these rules.\n", {
      policy: DEFAULT_FLOOR,
    });
    await fs.writeFile(path.join(this.dir, FILE), body, "utf8").catch(() => {});
  }
}

/** The primary `action` a rule targets — every canonical floor entry has exactly
 * one `{ type: "action" }` match condition, used as the merge key in
 * {@link PolicyStorageService.floor}. */
function primaryAction(rule: GateRule): string | undefined {
  return rule.match.find(
    (c): c is Extract<MatchCondition, { type: "action" }> => c.type === "action",
  )?.action;
}

/**
 * A conservative default floor (the seed + the canonical minimum every read of
 * `POLICY.md` is union-merged against — see {@link PolicyStorageService.floor}):
 * money / destructive / outbound / git-publish actions need a human. Most are
 * `ask:human`; `pr.merge` is a locked `deny` — merging is "Never" in the autonomy
 * contract, not merely gated, so it can't be unlocked by an agent rule (deny is
 * the max decision rank). Kept in lockstep with `data/POLICY.md` +
 * `data-test/POLICY.md` (Phase 3.2).
 */
const ASK_FLOOR_ACTIONS = [
  "purchase",
  "payment",
  "git.force_push",
  "git.push",
  // `pr.open` is deliberately NOT on this `ask` list: opening a PR is Tier-2
  // (act-then-report) — the north-star's "open a PR for a fix" — so it runs
  // autonomously. The raw `git.push` / `git.force_push` it rides still gate, and
  // `pr.merge` is a locked deny; publishing a PR is the one outbound git step
  // ZIBBY takes without asking. It DOES get its own `notify` floor entry below
  // (parallel to `agent.delegate`/`channel-reply`) so it has explicit floor
  // coverage instead of relying on the "nothing matched" fallback — which this
  // change (claim 3) flips from `allow` to `ask`, and an implicit `ask` on every
  // autonomous PR-open would be a severe, undocumented regression to Tier-2.
  "gh.api_write",
  "send_email",
  "delete",
  // The finished-day "creates a Jira task" — an outbound external write, so it is
  // structurally Tier-3 (surfaced for approval), never autonomous. Harden-only.
  "jira.create_issue",
  // Phase 8.1: spending past a per-engagement budget cap is a Tier-3 decision —
  // the budget guard holds the over-cap task and requests this approval (Law 3:
  // no autonomous spend past budget). Harden-only: an agent may raise it to deny.
  "spend-past-cap",
  // Phase 4d (Agent Factory): activating a deterministically-generated candidate
  // agent is a Tier-3 decision — it expands the dispatchable/delegatable surface,
  // so it always surfaces for sign-off (never silently activated, however
  // recurring the pattern that produced it). Harden-only: an agent may raise it
  // to deny, never weaken it.
  "agent.propose_new",
  // `deploy` (Tier-3) previously existed only as an editable/deletable entry in
  // the global gate-rules catalog (`gr-deploy-work`) — deleting that entry left
  // `deploy` completely ungated. It now also has a floor minimum: an operator's
  // catalog rule may still harden it (route to a reviewing agent, etc.), but it
  // can never be weakened below `ask`.
  "deploy",
] as const;

const DEFAULT_FLOOR: GateRule[] = [
  ...ASK_FLOOR_ACTIONS.map((action) => ({
    id: `floor-${action}`,
    source: "system" as const,
    locked: true,
    match: [{ type: "action" as const, action }],
    decision: "ask" as const,
    resolve: { type: "human" as const },
  })),
  {
    id: "floor-pr.merge",
    source: "system" as const,
    locked: true,
    match: [{ type: "action" as const, action: "pr.merge" }],
    decision: "deny" as const,
  },
  {
    // Phase 5.3: a channel reply notifies by default (rank 1, below `ask`), so a
    // per-channel agent rule can HARDEN it to `ask` (validateHardenOnly permits
    // only that direction). Email replies additionally hit the `send_email` floor.
    id: "floor-channel-reply",
    source: "system" as const,
    locked: true,
    match: [{ type: "action" as const, action: "channel-reply" }],
    decision: "notify" as const,
  },
  {
    // Fáze 2a: every subagent delegation (the `Task` tool) classifies to
    // `agent.delegate`, at very high frequency — the whole orchestrator → catalog
    // dispatch mechanism. It is intentionally Tier-1 (logged, not asked). Before
    // this change that was an ACCIDENTAL byproduct of the "nothing matched"
    // fallback defaulting to `allow`; now that claim 3 flips that fallback to
    // `ask`, delegation needs an explicit floor entry to keep its intended
    // behavior instead of blocking every handoff on human approval. `notify`
    // (not `allow`) also closes a smaller, separate gap: today an operator's own
    // gate-rules.json rule was the ONLY thing standing between `agent.delegate`
    // and unconditional, unlogged allow — there was zero floor protection on
    // delegation itself.
    id: "floor-agent.delegate",
    source: "system" as const,
    locked: true,
    match: [{ type: "action" as const, action: "agent.delegate" }],
    decision: "notify" as const,
  },
  {
    // See the `pr.open` comment on `ASK_FLOOR_ACTIONS` above: Tier-2
    // act-then-report, deliberately not `ask`, but now with explicit (logged)
    // floor coverage instead of relying on implicit fail-open.
    id: "floor-pr.open",
    source: "system" as const,
    locked: true,
    match: [{ type: "action" as const, action: "pr.open" }],
    decision: "notify" as const,
  },
];
