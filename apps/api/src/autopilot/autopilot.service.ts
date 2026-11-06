import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import {
  AUTOPILOT_SCOPE_TOGGLE,
  type Agent,
  type Approval,
  type AutomationToggles,
  type AutopilotActor,
  type AutopilotAutomation,
  type AutopilotLevel,
  type AutopilotLocation,
  type AutopilotScope,
  type AutopilotScopeKey,
  type AutopilotState,
  AutopilotStateSchema,
  type AutopilotStatus,
  type DepartmentId,
  FULL_AUTOPILOT_SCOPE,
  type IntendedAction,
  type Workflow,
  resolveAutopilotAutomation,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token for the directory holding `autopilot.json`. */
export const AUTOPILOT_DIR = "AUTOPILOT_DIR";

const FILE = "autopilot.json";

/** ZIBBY's own run branches (`WorkspaceService`: `zibby/<runId>-<slug>`). */
export function isZibbyBranch(branch: string | undefined): boolean {
  return !!branch && branch.startsWith("zibby/") && branch.length > "zibby/".length;
}

/**
 * What a caller established about the intent, beyond the intent itself. Never part of
 * `IntendedAction`, so a hook-posted intent can't claim it.
 * - `ownedBranch` — the head of a PR the operator authored (ZIBBY opens its PRs with the
 *   operator's token, so this is "ZIBBY's or the operator's" branch); a push onto it is
 *   covered like a `zibby/*` one.
 * - `scope` — the class the caller acts for; a hook intent (none given) counts as `comments`.
 * - `at` — where in the tree the class is read (any of several = covered); none = global.
 */
export interface AutopilotContext {
  ownedBranch?: string;
  scope?: AutopilotScopeKey;
  at?: AutopilotAt;
}

/** One place, or several (a PR of several teams: covered when any of them has the toggle on). */
export type AutopilotAt = AutopilotLocation | readonly AutopilotLocation[];

/** A push target autopilot covers: a `zibby/*` branch, or the given operator-owned PR head. */
function isOwnBranch(branch: string | undefined, ownedBranch?: string): boolean {
  return isZibbyBranch(branch) || (!!branch && branch === ownedBranch);
}

/**
 * Gate side of the allowlist: the system rule ids whose `ask` autopilot may turn into
 * act-then-report, each with the intent it covers (checked too, so a rule whose match
 * was edited never widens the overlay). Everything else — merge, deploy, payments,
 * spend past cap, deletes, force push, the generic `gh.api_write`, a push to a branch
 * that is neither ZIBBY's nor the operator's, operator questions — is not here and is untouched.
 */
export const AUTOPILOT_COVERED_RULES: Readonly<
  Record<string, (action: IntendedAction, context: AutopilotContext) => boolean>
> = {
  "floor-gh.pr_comment": (a) => a.action === "gh.pr_comment",
  // A comment also matches its parent class's system rule (`gh.pr_comment` ⊂ `gh.api_write`);
  // only that rule's `ask` is lifted, and only for a comment — a deny there still wins.
  "floor-gh.api_write": (a) => a.action === "gh.pr_comment",
  "floor-git.push": (a, c) => a.action === "git.push" && isOwnBranch(a.branch, c.ownedBranch),
};

/** The scope toggle an approval kind falls under; `null` = covered whenever autopilot is on. */
export function autopilotScopeFor(kind: Approval["kind"]): AutopilotScopeKey | null {
  switch (kind) {
    case "pr-review":
    case "workflow-gate":
      return "reviews";
    case "pr-address-comments":
      return "comments";
    case "channel":
      return "communication";
    default:
      return null;
  }
}

/**
 * Approval side of the allowlist: the approvals ZIBBY's own outbound flows raise for
 * the covered classes. Approved by autopilot at creation (never one already pending).
 * `headBranch` is the PR head a push approval would push to; `ownPr` = the operator
 * authored that PR. Scope toggles are the service's ({@link AutopilotService.coversApproval}).
 *
 * - `pr-review` "github.pr.review" — post a finished code review (as COMMENT);
 * - `workflow-gate` carrying `suggestedReviewEvent` — the pr-review workflow's sign-off gate;
 * - `pr-address-comments` "github.pr.comment" — post review-thread replies;
 * - `pr-address-comments` / `pr-fix-ci` "git.push" — only onto a `zibby/*` head or the operator's own PR;
 * - `channel` "channel-reply" — send a researched (concrete) reply draft.
 */
export function autopilotCoversApproval(
  approval: Pick<Approval, "kind" | "action" | "suggestedReviewEvent">,
  headBranch?: string,
  ownPr?: boolean,
): boolean {
  const ownPush =
    approval.action === "git.push" &&
    (isZibbyBranch(headBranch) || (ownPr === true && !!headBranch));
  switch (approval.kind) {
    case "pr-review":
      return approval.action === "github.pr.review";
    case "workflow-gate":
      return approval.suggestedReviewEvent !== undefined;
    case "pr-address-comments":
      return approval.action === "github.pr.comment" || ownPush;
    case "pr-fix-ci":
      return ownPush;
    case "channel":
      return approval.action === "channel-reply";
    default:
      return false;
  }
}

/**
 * The gate intent a covered approval stands for, so the approval side can ask the gate
 * evaluator the same question the hook side does (operator, agent and department rules
 * included). `null` → no intent can be built, and autopilot leaves the approval alone.
 */
export function autopilotIntentFor(
  approval: Pick<Approval, "kind" | "action">,
  headBranch?: string,
  ownPr?: boolean,
): IntendedAction | null {
  if (approval.action === "git.push") {
    return headBranch && (isZibbyBranch(headBranch) || ownPr === true)
      ? { action: "git.push", branch: headBranch }
      : null;
  }
  if (approval.kind === "pr-review" || approval.kind === "workflow-gate") {
    return { action: "gh.pr_comment" };
  }
  if (approval.kind === "pr-address-comments" && approval.action === "github.pr.comment") {
    return { action: "gh.pr_comment" };
  }
  return null;
}

/** The {@link AutopilotContext} the gate check of a covered approval runs with. */
export function autopilotContextFor(
  approval: Pick<Approval, "kind">,
  headBranch?: string,
  ownPr?: boolean,
  at?: AutopilotAt,
): AutopilotContext {
  const scope = autopilotScopeFor(approval.kind);
  return {
    ...(scope ? { scope } : {}),
    ...(ownPr === true && headBranch ? { ownedBranch: headBranch } : {}),
    ...(at ? { at } : {}),
  };
}

export type { AutopilotLocation };

/** The gate rules of a run's acting unit: its agents' own rules and its department. */
export interface AutopilotActors {
  agents: Pick<Agent, "gates" | "requires_approval">[];
  department?: DepartmentId;
}

/**
 * Resolve the agents and department a task target acts as: an agent (its own rules and
 * department) or a workflow (every phase agent, the workflow's department). Any other
 * target, or a missing agent/workflow, throws — the caller then fails closed.
 */
export async function autopilotActors(
  target: { kind: string; id?: string } | undefined,
  stores: {
    agents: { get(id: string): Promise<Agent> };
    workflows?: { get(id: string): Promise<Workflow> };
  },
): Promise<AutopilotActors> {
  if (target?.kind === "agent" && target.id) {
    const agent = await stores.agents.get(target.id);
    return { agents: [agent], department: agent.department };
  }
  if (target?.kind === "workflow" && target.id && stores.workflows) {
    const workflow = await stores.workflows.get(target.id);
    const ids = workflow.phases.flatMap((p) => (p.agent ? [p.agent] : []));
    return {
      agents: await Promise.all(ids.map((id) => stores.agents.get(id))),
      department: workflow.department,
    };
  }
  throw new Error(`autopilot: no gate actors for a ${target?.kind ?? "missing"} target`);
}

function describeScope(scope: AutopilotScope): string {
  const on = (Object.keys(scope) as AutopilotScopeKey[]).filter((k) => scope[k]);
  return on.length ? on.join(", ") : "pushes only";
}

/**
 * Phase 4 — the autopilot switch. `autopilot.json` is the truth; it is read once at
 * boot and cached, because the gate evaluator asks synchronously on every intent.
 * ponytail: a hand edit of the file applies on the next restart; the API is the way to switch.
 *
 * The overlay itself lives with its callers (the gate evaluator for intents, the
 * approval park sites for approvals); this service only answers "is it on, and is
 * this covered" and records the switch.
 */
@Injectable()
export class AutopilotService implements OnModuleInit {
  private state: AutopilotState = { level: "off" };

  constructor(
    @Inject(AUTOPILOT_DIR) private readonly dir: string,
    @Optional() private readonly approvals?: ApprovalsService,
    @Optional() private readonly activity?: ActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const raw = await fs.readFile(path.join(this.dir, FILE), "utf8").catch(() => null);
    const parsed = AutopilotStateSchema.safeParse(raw === null ? null : safeJson(raw));
    this.state = parsed.success ? parsed.data : { level: "off" };
    // A tree written before `autoCommunicate` existed: communication came from the stored scope.
    const { scope, automation } = this.state;
    if (scope && automation && !automation.global.autoCommunicate) {
      automation.global.autoCommunicate = scope.communication;
    }
  }

  isOn(): boolean {
    return this.state.level === "full";
  }

  /**
   * The classes the overlay covers at a company/team (global when `at` is empty), read off
   * the automation tree. A legacy state without a tree keeps its stored scope (none = all).
   */
  scope(at: AutopilotAt = {}): AutopilotScope {
    if (!this.state.automation) return this.state.scope ?? FULL_AUTOPILOT_SCOPE;
    const places: readonly AutopilotLocation[] = Array.isArray(at) ? at : [at as AutopilotLocation];
    const all = (places.length ? places : [{}]).map((p) =>
      resolveAutopilotAutomation(this.state, p),
    );
    const out = { ...FULL_AUTOPILOT_SCOPE };
    for (const k of Object.keys(out) as AutopilotScopeKey[])
      out[k] = all.some((toggles) => toggles[AUTOPILOT_SCOPE_TOGGLE[k]]);
    return out;
  }

  /** Every node of the tree (global, each company, each team), for the switch summary. */
  private everywhere(): AutopilotLocation[] {
    const { companies = {}, teams = {} } = this.state.automation ?? {};
    return [
      {},
      ...Object.keys(companies).map((companyId) => ({ companyId })),
      ...Object.keys(teams).map((teamId) => ({ teamId })),
    ];
  }

  /** Effective roadmap automation toggles at a company/team; all false while off. */
  automationFor(at: AutopilotLocation): AutomationToggles {
    return resolveAutopilotAutomation(this.state, at);
  }

  /** Whether the overlay turns this system rule's `ask` into act-then-report right now. */
  coversRule(ruleId: string, action: IntendedAction, context: AutopilotContext = {}): boolean {
    if (!this.isOn()) return false;
    // A PR comment belongs to whichever class posts it; a push is never toggled off.
    if (action.action === "gh.pr_comment" && !this.scope(context.at)[context.scope ?? "comments"]) {
      return false;
    }
    return AUTOPILOT_COVERED_RULES[ruleId]?.(action, context) ?? false;
  }

  /** Whether autopilot approves this freshly requested approval right now (`at` = where it acts). */
  coversApproval(
    approval: Pick<Approval, "kind" | "action" | "suggestedReviewEvent">,
    headBranch?: string,
    ownPr?: boolean,
    at: AutopilotAt = {},
  ): boolean {
    if (!this.isOn()) return false;
    const key = autopilotScopeFor(approval.kind);
    if (key && !this.scope(at)[key]) return false;
    return autopilotCoversApproval(approval, headBranch, ownPr);
  }

  async status(): Promise<AutopilotStatus> {
    const pending = (await this.approvals?.list("pending").catch(() => [])) ?? [];
    return { ...this.state, pendingApprovals: pending.length };
  }

  /**
   * Switch the level. Authorization is the caller's: only the operator-token route may
   * pass `full`. A no-op (no file write) only when level and automation tree are unchanged.
   * On/off is never pushed to Slack.
   */
  async set(
    level: AutopilotLevel,
    by: AutopilotActor,
    automation?: AutopilotAutomation,
  ): Promise<AutopilotStatus> {
    // Omitted keeps the stored tree (also across `off`, so the next switch-on pre-fills it).
    const nextAutomation = automation ?? this.state.automation;
    if (
      level === this.state.level &&
      JSON.stringify(nextAutomation) === JSON.stringify(this.state.automation)
    ) {
      return this.status();
    }
    const next: AutopilotState = {
      level,
      since: new Date().toISOString(),
      by,
      // A legacy scope only means something while there is no tree to read it from.
      ...(nextAutomation
        ? { automation: nextAutomation }
        : this.state.scope
          ? { scope: this.state.scope }
          : {}),
    };
    await ensureDir(this.dir);
    await writeFileAtomic(path.join(this.dir, FILE), `${JSON.stringify(next, null, 2)}\n`);
    this.state = next;
    const status = await this.status();
    void this.activity?.record({
      kind: "autopilot-changed",
      summary:
        level === "full"
          ? `autopilot ON (${by}; ${describeScope(this.scope(this.everywhere()))}) — ${status.pendingApprovals} approvals still pending, not auto-decided`
          : `autopilot OFF (${by}) — every gate asks again`,
      refs: { status: level, decision: by },
    });
    return status;
  }
}
