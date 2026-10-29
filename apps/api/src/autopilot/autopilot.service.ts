import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit, Optional } from "@nestjs/common";
import {
  type Agent,
  type Approval,
  type AutopilotActor,
  type AutopilotLevel,
  type AutopilotState,
  AutopilotStateSchema,
  type AutopilotStatus,
  type DepartmentId,
  type IntendedAction,
  type Workflow,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token for the directory holding `autopilot.json`. */
export const AUTOPILOT_DIR = "AUTOPILOT_DIR";

const FILE = "autopilot.json";

/** ZIBBY's own run branches (`WorkspaceService`: `zibby/<runId>-<slug>`) — the only push target autopilot covers. */
export function isZibbyBranch(branch: string | undefined): boolean {
  return !!branch && branch.startsWith("zibby/") && branch.length > "zibby/".length;
}

/**
 * Gate side of the allowlist: the system rule ids whose `ask` autopilot may turn into
 * act-then-report, each with the intent it covers (checked too, so a rule whose match
 * was edited never widens the overlay). Everything else — merge, deploy, payments,
 * spend past cap, deletes, force push, the generic `gh.api_write`, a push to any
 * non-`zibby/*` branch, operator questions — is not here and is untouched.
 */
export const AUTOPILOT_COVERED_RULES: Readonly<
  Record<string, (action: IntendedAction) => boolean>
> = {
  "floor-gh.pr_comment": (a) => a.action === "gh.pr_comment",
  // A comment also matches its parent class's system rule (`gh.pr_comment` ⊂ `gh.api_write`);
  // only that rule's `ask` is lifted, and only for a comment — a deny there still wins.
  "floor-gh.api_write": (a) => a.action === "gh.pr_comment",
  "floor-git.push": (a) => a.action === "git.push" && isZibbyBranch(a.branch),
};

/**
 * Approval side of the allowlist: the approvals ZIBBY's own outbound flows raise for
 * the covered classes. Approved by autopilot at creation (never one already pending).
 * `headBranch` is the PR head a push approval would push to.
 *
 * - `pr-review` "github.pr.review" — post a finished code review (as COMMENT);
 * - `workflow-gate` carrying `suggestedReviewEvent` — the pr-review workflow's sign-off gate;
 * - `pr-address-comments` "github.pr.comment" — post review-thread replies;
 * - `pr-address-comments` / `pr-fix-ci` "git.push" — only onto a `zibby/*` head;
 * - `channel` "channel-reply" — send a researched (concrete) reply draft.
 */
export function autopilotCoversApproval(
  approval: Pick<Approval, "kind" | "action" | "suggestedReviewEvent">,
  headBranch?: string,
): boolean {
  switch (approval.kind) {
    case "pr-review":
      return approval.action === "github.pr.review";
    case "workflow-gate":
      return approval.suggestedReviewEvent !== undefined;
    case "pr-address-comments":
      return (
        approval.action === "github.pr.comment" ||
        (approval.action === "git.push" && isZibbyBranch(headBranch))
      );
    case "pr-fix-ci":
      return approval.action === "git.push" && isZibbyBranch(headBranch);
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
): IntendedAction | null {
  if (approval.action === "git.push") {
    return isZibbyBranch(headBranch) ? { action: "git.push", branch: headBranch } : null;
  }
  if (approval.kind === "pr-review" || approval.kind === "workflow-gate") {
    return { action: "gh.pr_comment" };
  }
  if (approval.kind === "pr-address-comments" && approval.action === "github.pr.comment") {
    return { action: "gh.pr_comment" };
  }
  return null;
}

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
  }

  isOn(): boolean {
    return this.state.level === "full";
  }

  /** Whether the overlay turns this system rule's `ask` into act-then-report right now. */
  coversRule(ruleId: string, action: IntendedAction): boolean {
    return this.isOn() && (AUTOPILOT_COVERED_RULES[ruleId]?.(action) ?? false);
  }

  /** Whether autopilot approves this freshly requested approval right now. */
  coversApproval(
    approval: Pick<Approval, "kind" | "action" | "suggestedReviewEvent">,
    headBranch?: string,
  ): boolean {
    return this.isOn() && autopilotCoversApproval(approval, headBranch);
  }

  async status(): Promise<AutopilotStatus> {
    const pending = (await this.approvals?.list("pending").catch(() => [])) ?? [];
    return { ...this.state, pendingApprovals: pending.length };
  }

  /**
   * Switch the level. Authorization is the caller's: only the operator-token route may
   * pass `full`. Re-setting the current level is a no-op (no file write, no notice).
   */
  async set(level: AutopilotLevel, by: AutopilotActor): Promise<AutopilotStatus> {
    if (level === this.state.level) return this.status();
    const next: AutopilotState = { level, since: new Date().toISOString(), by };
    await ensureDir(this.dir);
    await writeFileAtomic(path.join(this.dir, FILE), `${JSON.stringify(next, null, 2)}\n`);
    this.state = next;
    const status = await this.status();
    void this.activity?.record({
      kind: "autopilot-changed",
      summary:
        level === "full"
          ? `autopilot ON (${by}) — ${status.pendingApprovals} approvals still pending, not auto-decided`
          : `autopilot OFF (${by}) — every gate asks again`,
      refs: { status: level, decision: by },
    });
    return status;
  }
}
