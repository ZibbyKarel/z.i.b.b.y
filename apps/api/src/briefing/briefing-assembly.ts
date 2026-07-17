import type {
  ActivityEntry,
  Approval,
  Briefing,
  BriefingDidItem,
  BriefingEngagement,
  BriefingNeedsYouItem,
  BriefingSubsystemLine,
  BriefingWatchItem,
  ChannelItem,
  CiStatus,
  GoalRun,
  PipelineRun,
  ScheduledTask,
} from "@zibby/contracts";

/** The raw inputs the briefing is assembled from — all gathered before this runs. */
export interface BriefingInput {
  now: Date;
  since: string;
  /** Pending approvals (Tier-3 decisions waiting). */
  approvals: Approval[];
  /** Parked pipeline runs (status === "parked"). */
  parkedRuns: PipelineRun[];
  /** Phase 9: pipeline runs currently paused on the usage limit (status "paused-limit"). */
  pausedLimitRuns?: PipelineRun[];
  /** Phase 10: goal runs in flight (running / paused-limit) and parked (needs-you). */
  goalRuns?: GoalRun[];
  /** Channel items still in flight (state new or triaged). */
  channelItems: ChannelItem[];
  /** Activity entries recorded since the cursor (newest-first is fine; we sort). */
  activity: ActivityEntry[];
  /** Queued + held tasks (Phase 8.2) — the engagement rollup's waiting work. */
  tasks?: ScheduledTask[];
  /** M8: dead-lettered tasks (dispatch exhausted its retries) — each a needs-you. */
  deadLetteredTasks?: ScheduledTask[];
  /** N4b: last known CI statuses — a red one is a needs-you STATE line (no re-alerts). */
  ciStatuses?: CiStatus[];
  /** projectId → display name, so the rollup reads in the operator's terms. */
  projectNames?: Record<string, string>;
  /** One-line summaries from the past 7 daily vault notes (M3 7-day context). */
  trend7d?: string[];
  /** Proposed autonomous rules extracted from 30-day approval patterns (M4). */
  learnedPatterns?: string[];
  /** Recurring-manual-work "automate it?" suggestions (M5 GapDetector). */
  automationGaps?: string[];
  /** Weekly "3 app ideas" — interests × trends prototype pitches (M6). */
  appIdeas?: string[];
  /** NS2 F3b — per-subsystem lines, gathered by the service (state + tier counts
   * from SubsystemsService, Ledger/Puls notes). Absent when the read failed. */
  subsystems?: BriefingSubsystemLine[];
  /** NS2 F4c — whether the self-knowledge vault note has drifted from a fresh
   * compose (gathered via `SelfKnowledgeService.check()`, fail-open to `false`). */
  selfKnowledgeDrift?: boolean;
  /** NS2 F5a — Sentinel's open security findings (CVE/secret), read off its vault note. */
  securityFindings?: string[];
}

/** Activity kinds that count as "ZIBBY did this for you". */
const DID_KINDS = new Set<ActivityEntry["kind"]>([
  "task-outcome",
  "channel-reply",
  "run-finished",
  "pipeline-finished",
  "approval-approved",
]);

/** Max "did for you" lines surfaced (the rest are still in the activity feed). */
const DID_LIMIT = 10;

/**
 * Assemble a {@link Briefing} from gathered state — a PURE function (no Nest, no
 * I/O), so section selection, sorting, counts and the deterministic headline are
 * all snapshot-testable. "nothing needs you" (empty `needsYou`) is a valid,
 * first-class output.
 */
export function assembleBriefing(input: BriefingInput): Briefing {
  const goalRuns = input.goalRuns ?? [];
  const needsYou = buildNeedsYou(
    input.approvals,
    input.parkedRuns,
    goalRuns,
    input.deadLetteredTasks ?? [],
    input.ciStatuses ?? [],
  );
  const didForYou = buildDidForYou(input.activity);
  const watching = buildWatching(input.channelItems, input.pausedLimitRuns ?? [], goalRuns);
  const engagements = buildEngagements(
    input.tasks ?? [],
    didForYou,
    needsYou,
    input.projectNames ?? {},
  );
  const counts = {
    runsFinished: input.activity.filter((e) => isFinished(e) && !isFailed(e)).length,
    runsFailed: input.activity.filter(isFailed).length,
    parked: input.parkedRuns.length,
    approvalsPending: input.approvals.length,
    channelItemsNew: input.channelItems.filter((i) => i.state === "new").length,
  };
  const nothingNeedsYou = needsYou.length === 0;
  return {
    generatedAt: input.now.toISOString(),
    since: input.since,
    headline: deterministicHeadline(needsYou),
    nothingNeedsYou,
    needsYou,
    didForYou,
    watching,
    engagements,
    counts,
    ...(input.trend7d && input.trend7d.length > 0 ? { trend7d: input.trend7d } : {}),
    ...(input.learnedPatterns && input.learnedPatterns.length > 0
      ? { learnedPatterns: input.learnedPatterns }
      : {}),
    ...(input.automationGaps && input.automationGaps.length > 0
      ? { automationGaps: input.automationGaps }
      : {}),
    ...(input.appIdeas && input.appIdeas.length > 0 ? { appIdeas: input.appIdeas } : {}),
    ...(input.subsystems && input.subsystems.length > 0 ? { subsystems: input.subsystems } : {}),
    ...(input.selfKnowledgeDrift ? { selfKnowledgeDrift: true } : {}),
    ...(input.securityFindings && input.securityFindings.length > 0
      ? { securityFindings: input.securityFindings }
      : {}),
  };
}

/**
 * Roll the briefing up by engagement (Phase 8.2): one row per project that has
 * waiting tasks (queued/held) or attributable activity. `held` tasks count toward
 * `needsYou` (each is a Tier-3 budget decision); `didForYou` counts the attributable
 * activity lines. Pure — sorted needsYou desc, then name. Empty when nothing carries
 * a projectId, so a single-engagement operator sees no rollup noise.
 */
export function buildEngagements(
  tasks: ScheduledTask[],
  didForYou: BriefingDidItem[],
  needsYou: BriefingNeedsYouItem[],
  projectNames: Record<string, string>,
): BriefingEngagement[] {
  const rows = new Map<string, BriefingEngagement>();
  const row = (projectId: string): BriefingEngagement => {
    let r = rows.get(projectId);
    if (!r) {
      r = {
        projectId,
        name: projectNames[projectId] ?? projectId,
        needsYou: 0,
        didForYou: 0,
        queued: 0,
        held: 0,
      };
      rows.set(projectId, r);
    }
    return r;
  };
  for (const task of tasks) {
    if (!task.projectId) continue;
    if (task.status === "queued") row(task.projectId).queued += 1;
    else if (task.status === "held") {
      const r = row(task.projectId);
      r.held += 1;
      r.needsYou += 1;
    }
  }
  for (const item of didForYou) if (item.projectId) row(item.projectId).didForYou += 1;
  for (const item of needsYou) if (item.projectId) row(item.projectId).needsYou += 1;
  return [...rows.values()].sort((a, b) => b.needsYou - a.needsYou || a.name.localeCompare(b.name));
}

function buildNeedsYou(
  approvals: Approval[],
  parkedRuns: PipelineRun[],
  goalRuns: GoalRun[],
  deadLetteredTasks: ScheduledTask[],
  ciStatuses: CiStatus[],
): BriefingNeedsYouItem[] {
  const fromApprovals: BriefingNeedsYouItem[] = approvals.map((a) => ({
    kind: "approval",
    id: a.id,
    summary: `${a.skill} wants to ${a.action}`,
    at: a.requestedAt,
    refs: { approvalId: a.id, runRef: a.runId, action: a.action },
  }));
  const fromParked: BriefingNeedsYouItem[] = parkedRuns.map((r) => ({
    kind: "parked",
    id: r.pipelineRunId,
    summary: `pipeline ${r.pipelineId} parked${r.parkedReason ? ` (${r.parkedReason})` : ""}`,
    at: r.startedAt,
    refs: { runRef: r.pipelineRunId, pipelineId: r.pipelineId, status: "parked" },
  }));
  // Phase 10: a parked goal (bounded effort exhausted) is a Tier-3 decision too —
  // it rides the same `parked` notification, no new kind (decision 11).
  const fromParkedGoals: BriefingNeedsYouItem[] = goalRuns
    .filter((g) => g.status === "parked")
    .map((g) => ({
      kind: "parked",
      id: g.goalRunId,
      summary: `goal ${g.goalId} parked${g.parkedReason ? ` (${g.parkedReason})` : ""}`,
      at: g.startedAt,
      refs: { runRef: g.goalRunId, goalId: g.goalId, status: "parked" },
    }));
  // M8: a dead-lettered task (dispatch exhausted its retries) needs the operator —
  // it rides the same `parked` notification (no new kind), so a repeatedly-failing
  // task surfaces in the briefing instead of dying silently in the runs feed.
  const fromDeadLetter: BriefingNeedsYouItem[] = deadLetteredTasks.map((t) => ({
    kind: "parked",
    id: t.id,
    summary: `task "${(t.title ?? t.text).slice(0, 80)}" failed repeatedly${t.error ? ` (${t.error})` : ""}`,
    at: t.createdAt,
    refs: {
      taskId: t.id,
      status: "dead-letter",
      ...(t.projectId ? { projectId: t.projectId } : {}),
    },
  }));
  // N4b: a currently-red CI is a needs-you STATE line — it exists while the state
  // lasts and disappears when the build goes green (alert-fatigue discipline: the
  // one-time notification is the N3 monitor-alert; this line never re-alerts).
  const fromRedCi: BriefingNeedsYouItem[] = ciStatuses
    .filter((s) => s.state === "red")
    .map((s) => ({
      kind: "ci-red",
      id: `${s.integrationId}--${s.adapterKind}`,
      summary: `CI red since ${s.sinceAt} — ${s.summary}`,
      at: s.sinceAt,
      refs: {
        integrationId: s.integrationId,
        ...(s.projectId ? { projectId: s.projectId } : {}),
      },
      ...(s.projectId ? { projectId: s.projectId } : {}),
    }));
  // Newest first so the most recent decision tops the list.
  return [
    ...fromApprovals,
    ...fromParked,
    ...fromParkedGoals,
    ...fromDeadLetter,
    ...fromRedCi,
  ].sort((a, b) => b.at.localeCompare(a.at));
}

function buildDidForYou(activity: ActivityEntry[]): BriefingDidItem[] {
  return activity
    .filter((e) => DID_KINDS.has(e.kind))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DID_LIMIT)
    .map((e) => ({
      kind: e.kind,
      summary: e.summary,
      at: e.at,
      ...(e.refs.projectId ? { projectId: e.refs.projectId } : {}),
    }));
}

function buildWatching(
  channelItems: ChannelItem[],
  pausedLimitRuns: PipelineRun[],
  goalRuns: GoalRun[],
): BriefingWatchItem[] {
  const byIntegration = new Map<string, { newItems: number; lastReceivedAt?: string }>();
  for (const item of channelItems) {
    const cur = byIntegration.get(item.integrationId) ?? { newItems: 0 };
    if (item.state === "new") cur.newItems += 1;
    if (!cur.lastReceivedAt || item.receivedAt > cur.lastReceivedAt)
      cur.lastReceivedAt = item.receivedAt;
    byIntegration.set(item.integrationId, cur);
  }
  const channels: BriefingWatchItem[] = [...byIntegration.entries()]
    .map(([integrationId, v]) => ({
      integrationId,
      newItems: v.newItems,
      ...(v.lastReceivedAt ? { lastReceivedAt: v.lastReceivedAt } : {}),
    }))
    .sort((a, b) => a.integrationId.localeCompare(b.integrationId));
  // Phase 9: a run paused on the usage limit is something ZIBBY is watching, not
  // something that needs the operator — it auto-resumes. Sorted by soonest resume.
  const paused: BriefingWatchItem[] = pausedLimitRuns
    .map((r) => ({
      runRef: r.pipelineRunId,
      summary: `pipeline ${r.pipelineId} paused on the usage limit`,
      resumeAt: r.resumeAt ?? null,
    }))
    .sort((a, b) => (a.resumeAt ?? Infinity) - (b.resumeAt ?? Infinity));
  // Phase 10: an in-flight goal (running) or a goal reflecting a maker pause are
  // things ZIBBY is working on, not decisions — surface them in "watching".
  const goals: BriefingWatchItem[] = goalRuns
    .filter((g) => g.status === "running" || g.status === "paused-limit")
    .map((g) => ({
      runRef: g.goalRunId,
      summary:
        g.status === "paused-limit"
          ? `goal ${g.goalId} paused on the usage limit`
          : `goal ${g.goalId} iterating (${(g.currentIteration ?? 0) + 1})`,
      resumeAt: g.resumeAt ?? null,
    }))
    .sort((a, b) => (a.resumeAt ?? Infinity) - (b.resumeAt ?? Infinity));
  return [...channels, ...paused, ...goals];
}

function isFinished(e: ActivityEntry): boolean {
  return e.kind === "run-finished" || e.kind === "pipeline-finished";
}

function isFailed(e: ActivityEntry): boolean {
  if (!isFinished(e)) return false;
  const status = e.refs.status;
  return status === "error" || status === "interrupted" || status === "failed";
}

/**
 * The deterministic, butler-voiced headline — the fallback when the optional
 * claude pass is skipped (tests, timeout) and the test-mode constant. English to
 * match the activity record the briefing is assembled from.
 */
export function deterministicHeadline(needsYou: BriefingNeedsYouItem[]): string {
  if (needsYou.length === 0) return "Nothing needs you.";
  const approvals = needsYou.filter((n) => n.kind === "approval").length;
  const parked = needsYou.filter((n) => n.kind === "parked").length;
  const redCi = needsYou.filter((n) => n.kind === "ci-red").length;
  const parts: string[] = [];
  if (approvals > 0) parts.push(`${approvals} ${plural(approvals, "approval", "approvals")}`);
  if (parked > 0) parts.push(`${parked} parked ${plural(parked, "run", "runs")}`);
  if (redCi > 0) parts.push(`${redCi} red CI`);
  const n = needsYou.length;
  const verb = n === 1 ? "needs" : "need";
  return `${n} ${plural(n, "thing", "things")} ${verb} you — ${parts.join(", ")}.`;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Render the briefing as the markdown body of its vault note (the prose artifact). */
export function renderBriefingMarkdown(briefing: Briefing): string {
  const lines: string[] = [`# Briefing`, "", briefing.headline, ""];

  lines.push("## Needs you");
  if (briefing.needsYou.length === 0) {
    lines.push("- Nothing needs you.");
  } else {
    for (const n of briefing.needsYou) lines.push(`- **${n.kind}** — ${n.summary}`);
  }
  lines.push("");

  lines.push("## Did for you");
  if (briefing.didForYou.length === 0) {
    lines.push("- Nothing recorded in this window.");
  } else {
    for (const d of briefing.didForYou) lines.push(`- ${d.summary}`);
  }
  lines.push("");

  if (briefing.watching.length > 0) {
    lines.push("## Watching");
    for (const w of briefing.watching) {
      if (w.summary) {
        const eta = w.resumeAt ? `, resumes ${new Date(w.resumeAt).toISOString()}` : "";
        lines.push(`- ${w.summary}${eta}`);
      } else {
        lines.push(`- ${w.integrationId}: ${w.newItems ?? 0} new`);
      }
    }
    lines.push("");
  }

  if ((briefing.subsystems && briefing.subsystems.length > 0) || briefing.selfKnowledgeDrift) {
    lines.push("## Subsystems");
    for (const s of briefing.subsystems ?? []) {
      const counts: string[] = [];
      if (s.tier3Count > 0) counts.push(`${s.tier3Count} waiting on you`);
      if (s.tier2Count > 0) counts.push(`${s.tier2Count} reported`);
      const detail = [s.state, ...counts, ...(s.note ? [s.note] : [])].join(" · ");
      lines.push(`- **${s.name}** — ${detail}`);
    }
    // NS2 F4c: Codex owns the second brain — its drift signal lands in the same
    // Subsystems section rather than a duplicate `## Memory` heading.
    if (briefing.selfKnowledgeDrift) {
      lines.push(
        "- self-knowledge note drifted from the live catalog (nightly refresh may have failed)",
      );
    }
    lines.push("");
  }

  if (briefing.securityFindings && briefing.securityFindings.length > 0) {
    lines.push("## Security");
    for (const item of briefing.securityFindings) lines.push(`- ${item}`);
    lines.push("");
  }

  if (briefing.automationGaps && briefing.automationGaps.length > 0) {
    lines.push("## Gaps I noticed");
    for (const item of briefing.automationGaps) lines.push(`- ${item}`);
    lines.push("");
  }

  if (briefing.appIdeas && briefing.appIdeas.length > 0) {
    lines.push("## App ideas");
    for (const item of briefing.appIdeas) lines.push(`- ${item}`);
    lines.push("");
  }

  const c = briefing.counts;
  lines.push("## Counts");
  lines.push(
    `- ${c.runsFinished} finished · ${c.runsFailed} failed · ${c.parked} parked · ` +
      `${c.approvalsPending} approvals pending · ${c.channelItemsNew} new channel items`,
  );
  return `${lines.join("\n")}\n`;
}
