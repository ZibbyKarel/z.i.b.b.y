import type {
  ActivityEntry,
  Approval,
  Briefing,
  BriefingDidItem,
  BriefingNeedsYouItem,
  BriefingWatchItem,
  ChannelItem,
  PipelineRun,
} from "@zibby/contracts"

/** The raw inputs the briefing is assembled from — all gathered before this runs. */
export interface BriefingInput {
  now: Date
  since: string
  /** Pending approvals (Tier-3 decisions waiting). */
  approvals: Approval[]
  /** Parked pipeline runs (status === "parked"). */
  parkedRuns: PipelineRun[]
  /** Channel items still in flight (state new or triaged). */
  channelItems: ChannelItem[]
  /** Activity entries recorded since the cursor (newest-first is fine; we sort). */
  activity: ActivityEntry[]
}

/** Activity kinds that count as "ZIBBY did this for you". */
const DID_KINDS = new Set<ActivityEntry["kind"]>([
  "task-outcome",
  "channel-reply",
  "run-finished",
  "pipeline-finished",
  "approval-approved",
])

/** Max "did for you" lines surfaced (the rest are still in the activity feed). */
const DID_LIMIT = 10

/**
 * Assemble a {@link Briefing} from gathered state — a PURE function (no Nest, no
 * I/O), so section selection, sorting, counts and the deterministic headline are
 * all snapshot-testable. "nothing needs you" (empty `needsYou`) is a valid,
 * first-class output.
 */
export function assembleBriefing(input: BriefingInput): Briefing {
  const needsYou = buildNeedsYou(input.approvals, input.parkedRuns)
  const didForYou = buildDidForYou(input.activity)
  const watching = buildWatching(input.channelItems)
  const counts = {
    runsFinished: input.activity.filter((e) => isFinished(e) && !isFailed(e)).length,
    runsFailed: input.activity.filter(isFailed).length,
    parked: input.parkedRuns.length,
    approvalsPending: input.approvals.length,
    channelItemsNew: input.channelItems.filter((i) => i.state === "new").length,
  }
  const nothingNeedsYou = needsYou.length === 0
  return {
    generatedAt: input.now.toISOString(),
    since: input.since,
    headline: deterministicHeadline(needsYou),
    nothingNeedsYou,
    needsYou,
    didForYou,
    watching,
    counts,
  }
}

function buildNeedsYou(approvals: Approval[], parkedRuns: PipelineRun[]): BriefingNeedsYouItem[] {
  const fromApprovals: BriefingNeedsYouItem[] = approvals.map((a) => ({
    kind: "approval",
    id: a.id,
    summary: `${a.skill} wants to ${a.action}`,
    at: a.requestedAt,
    refs: { approvalId: a.id, runRef: a.runId, action: a.action },
  }))
  const fromParked: BriefingNeedsYouItem[] = parkedRuns.map((r) => ({
    kind: "parked",
    id: r.pipelineRunId,
    summary: `pipeline ${r.pipelineId} parked${r.parkedReason ? ` (${r.parkedReason})` : ""}`,
    at: r.startedAt,
    refs: { runRef: r.pipelineRunId, pipelineId: r.pipelineId, status: "parked" },
  }))
  // Newest first so the most recent decision tops the list.
  return [...fromApprovals, ...fromParked].sort((a, b) => b.at.localeCompare(a.at))
}

function buildDidForYou(activity: ActivityEntry[]): BriefingDidItem[] {
  return activity
    .filter((e) => DID_KINDS.has(e.kind))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DID_LIMIT)
    .map((e) => ({ kind: e.kind, summary: e.summary, at: e.at }))
}

function buildWatching(channelItems: ChannelItem[]): BriefingWatchItem[] {
  const byIntegration = new Map<string, { newItems: number; lastReceivedAt?: string }>()
  for (const item of channelItems) {
    const cur = byIntegration.get(item.integrationId) ?? { newItems: 0 }
    if (item.state === "new") cur.newItems += 1
    if (!cur.lastReceivedAt || item.receivedAt > cur.lastReceivedAt) cur.lastReceivedAt = item.receivedAt
    byIntegration.set(item.integrationId, cur)
  }
  return [...byIntegration.entries()]
    .map(([integrationId, v]) => ({ integrationId, newItems: v.newItems, ...(v.lastReceivedAt ? { lastReceivedAt: v.lastReceivedAt } : {}) }))
    .sort((a, b) => a.integrationId.localeCompare(b.integrationId))
}

function isFinished(e: ActivityEntry): boolean {
  return e.kind === "run-finished" || e.kind === "pipeline-finished"
}

function isFailed(e: ActivityEntry): boolean {
  if (!isFinished(e)) return false
  const status = e.refs.status
  return status === "error" || status === "interrupted" || status === "failed"
}

/**
 * The deterministic, butler-voiced headline — the fallback when the optional
 * claude pass is skipped (tests, timeout) and the test-mode constant. English to
 * match the activity record the briefing is assembled from.
 */
export function deterministicHeadline(needsYou: BriefingNeedsYouItem[]): string {
  if (needsYou.length === 0) return "Nothing needs you."
  const approvals = needsYou.filter((n) => n.kind === "approval").length
  const parked = needsYou.filter((n) => n.kind === "parked").length
  const parts: string[] = []
  if (approvals > 0) parts.push(`${approvals} ${plural(approvals, "approval", "approvals")}`)
  if (parked > 0) parts.push(`${parked} parked ${plural(parked, "run", "runs")}`)
  const n = needsYou.length
  const verb = n === 1 ? "needs" : "need"
  return `${n} ${plural(n, "thing", "things")} ${verb} you — ${parts.join(", ")}.`
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** Render the briefing as the markdown body of its vault note (the prose artifact). */
export function renderBriefingMarkdown(briefing: Briefing): string {
  const lines: string[] = [`# Briefing`, "", briefing.headline, ""]

  lines.push("## Needs you")
  if (briefing.needsYou.length === 0) {
    lines.push("- Nothing needs you.")
  } else {
    for (const n of briefing.needsYou) lines.push(`- **${n.kind}** — ${n.summary}`)
  }
  lines.push("")

  lines.push("## Did for you")
  if (briefing.didForYou.length === 0) {
    lines.push("- Nothing recorded in this window.")
  } else {
    for (const d of briefing.didForYou) lines.push(`- ${d.summary}`)
  }
  lines.push("")

  if (briefing.watching.length > 0) {
    lines.push("## Watching")
    for (const w of briefing.watching) lines.push(`- ${w.integrationId}: ${w.newItems} new`)
    lines.push("")
  }

  const c = briefing.counts
  lines.push("## Counts")
  lines.push(
    `- ${c.runsFinished} finished · ${c.runsFailed} failed · ${c.parked} parked · ` +
      `${c.approvalsPending} approvals pending · ${c.channelItemsNew} new channel items`,
  )
  return `${lines.join("\n")}\n`
}
