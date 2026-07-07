"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Button,
  Container,
  Icon,
  type IconName,
  IconTile,
  Pressable,
  Stack,
  StatusDot,
  Tag,
  Typography,
  cn,
  stateToneVar,
} from "@zibby/design-system";
import { useAgentsQuery } from "../../agents";
import { usePipelinesQuery } from "../../pipelines";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { formatCostUsd } from "../../../utils/cost";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import { useStageRunLogStream } from "../useRunLogStream";
import { type FeedStatus, RUN_STATE, type RunView } from "../run";
import { RunStateBadge } from "./RunStateBadge";
import { RunTranscript } from "./RunTranscript";

export interface PipelineStageTimelineProps {
  /** The pipeline run whose stages to show (its own runId, or a goal's pipeline maker ref). */
  pipelineRunId: string;
  /** The pipeline definition id, for the "open pipeline" link (empty → link hidden) and for
   * resolving each phase's agent (avatar/name) + loop (retry) metadata. */
  owner: string;
  /** The per-phase stage runs (may be undefined while the run aggregate is loading). */
  stageRuns: RunView["stageRuns"];
  /** The phase currently executing — surfaced as a live row when the run is running. */
  currentStage?: string | null;
  /** Whether the run is still executing (drives the synthetic live stage row + live log). */
  live?: boolean;
  /** Present while the run is retries-parked — feeds the escalated phase's retry block
   * (the design's "vyčerpány pokusy → eskalace → zaparkováno" line). */
  parked?: RunView["parked"];
}

export enum PipelineStageTimelineTestId {
  Root = "pipeline-stage-timeline",
  Connector = "pipeline-stage-connector",
  RowToggle = "pipeline-stage-row-toggle",
}

type StageRunEntry = NonNullable<RunView["stageRuns"]>[number];

/**
 * One node of the vertical timeline: a pipeline PHASE (not a single attempt). `main`
 * is the phase's latest recorded (or live) attempt; `priorAttempts` are earlier
 * attempts of the same phase from a loop back-edge (Phase 45's qualify retries, or a
 * plain phase re-run) — folded into a nested retry block instead of their own node,
 * mirroring the design. `main` is `null` for a not-yet-reached phase, synthesized
 * from the pipeline definition only while the run is still open (see
 * {@link buildPhaseNodes}).
 */
interface PhaseNode {
  phaseId: string;
  main: StageRunEntry | null;
  priorAttempts: StageRunEntry[];
}

/**
 * Groups `stageRuns` by `phaseId` — the runner records one entry per (phase, attempt),
 * so a phase retried by a loop back-edge (or re-qualified) has several entries under the
 * same id. Each group's last entry is the phase's current node; earlier entries become
 * its nested retry rows. When the pipeline DEFINITION is known, phases are laid out in
 * its declared order and any not-yet-reached phase (after the furthest one with a
 * recorded attempt) gets a placeholder ("waiting") node — but only while the run hasn't
 * finished (`currentStage` still set; the backend nulls it once done/errored/interrupted,
 * even while parked or paused-limit). Without a definition (still loading, or an unknown
 * owner) this degrades to plain chronological order with no placeholders.
 */
function buildPhaseNodes(
  stageRuns: RunView["stageRuns"],
  currentStage: string | null | undefined,
  live: boolean,
  definedPhaseIds: string[] | undefined,
): PhaseNode[] {
  const terminalStages = stageRuns ?? [];
  // The phase executing right now isn't in `stageRuns` yet (that append is
  // terminal-only) — synthesize a live row for it, one attempt past whatever
  // terminal attempts are already recorded for that phase.
  const liveRow: StageRunEntry | null =
    live && currentStage
      ? {
          phaseId: currentStage,
          runId: "",
          attempt: terminalStages.filter((s) => s.phaseId === currentStage).length + 1,
          status: "running",
        }
      : null;
  const allRuns = liveRow ? [...terminalStages, liveRow] : terminalStages;

  const order: string[] = [];
  const groups = new Map<string, StageRunEntry[]>();
  for (const r of allRuns) {
    if (!groups.has(r.phaseId)) {
      groups.set(r.phaseId, []);
      order.push(r.phaseId);
    }
    groups.get(r.phaseId)?.push(r);
  }
  for (const g of groups.values()) g.sort((a, b) => a.attempt - b.attempt);

  if (!definedPhaseIds || definedPhaseIds.length === 0) {
    return order.map((phaseId) => {
      const g = groups.get(phaseId) ?? [];
      return { phaseId, main: g[g.length - 1] ?? null, priorAttempts: g.slice(0, -1) };
    });
  }

  let lastReachedIdx = -1;
  definedPhaseIds.forEach((id, i) => {
    if (groups.has(id)) lastReachedIdx = i;
  });

  const nodes: PhaseNode[] = [];
  definedPhaseIds.forEach((id, i) => {
    const g = groups.get(id);
    if (g) {
      nodes.push({ phaseId: id, main: g[g.length - 1] ?? null, priorAttempts: g.slice(0, -1) });
    } else if (i > lastReachedIdx && currentStage != null) {
      nodes.push({ phaseId: id, main: null, priorAttempts: [] });
    }
  });
  return nodes;
}

/**
 * One pipeline stage's log, mounted only while the row is expanded so a collapsed
 * stage costs nothing. A `live` (still-executing) phase tails over SSE
 * ({@link useStageRunLogStream} — DNA: a log is a live stream, never an interval
 * poll), so the log grows in place; a terminal phase is a one-shot read of state
 * from the contract's `…/stages/:phaseId/logs` endpoint.
 */
function StageLog({
  pipelineRunId,
  phaseId,
  live,
}: {
  pipelineRunId: string;
  phaseId: string;
  live: boolean;
}) {
  return live ? (
    <LiveStageLog phaseId={phaseId} pipelineRunId={pipelineRunId} />
  ) : (
    <TerminalStageLog phaseId={phaseId} pipelineRunId={pipelineRunId} />
  );
}

/** The SSE tail of the phase executing right now — pushed, not polled. */
function LiveStageLog({ pipelineRunId, phaseId }: { pipelineRunId: string; phaseId: string }) {
  const t = useTranslations("runs");
  const { text: streamed } = useStageRunLogStream(pipelineRunId, phaseId);
  const text = streamed.replace(/\n$/, "");
  return text ? (
    <RunTranscript
      live
      maxHeight="viewport"
      scrollKey={text}
      text={text}
      toggleLabel={t("toggleToolOutput")}
    />
  ) : (
    <Typography mono size="2xs" type="note" variant="tertiary">
      {t("liveLog")}…
    </Typography>
  );
}

/** A finished phase's log — immutable state, read once. */
function TerminalStageLog({
  pipelineRunId,
  phaseId,
}: {
  pipelineRunId: string;
  phaseId: string;
}) {
  const t = useTranslations("runs");
  const { data, isPending } = useStageRunLogQuery(pipelineRunId, phaseId);
  const text = (data?.content ?? "").replace(/\n$/, "");
  if (isPending) {
    return (
      <Typography mono size="2xs" type="note" variant="tertiary">
        {t("liveLog")}…
      </Typography>
    );
  }
  return text ? (
    <RunTranscript
      live={false}
      maxHeight="viewport"
      scrollKey={text}
      text={text}
      toggleLabel={t("toggleToolOutput")}
    />
  ) : (
    <Typography mono size="2xs" type="note" variant="tertiary">
      {t("stageNoLog")}
    </Typography>
  );
}

interface RetryBlockProps {
  attempts: StageRunEntry[];
  maxRetries?: number;
  loopTo?: string;
  escalated: boolean;
}

/**
 * The stage's rework loop, nested under its current node — mirrors the design's
 * `RetryBlock`: one row per exhausted prior attempt ("pokus N/maxRetries" — the
 * fraction omitted when the pipeline definition isn't known), each showing its
 * real outcome (a qualify phase's `verdict`, else its terminal `status` — never a
 * fabricated note), and — while the run is parked with retries exhausted at this
 * exact phase — the escalation line.
 */
function RetryBlock({ attempts, maxRetries, loopTo, escalated }: RetryBlockProps) {
  const t = useTranslations("runs");
  return (
    <Container
      style={{
        borderLeft: "2px solid color-mix(in srgb, var(--color-bad) 28%, transparent)",
        marginTop: "0.5rem",
        paddingLeft: "0.75rem",
      }}
    >
      <Stack gap="50">
        {attempts.map((a) => (
          <Stack
            align="center"
            direction="row"
            gap="75"
            justify="between"
            key={`${a.phaseId}-${a.attempt}`}
          >
            <Stack align="center" direction="row" gap="75">
              <Icon name="retry" size="xs" tone="bad" />
              <Typography mono size="2xs" type="note" variant="tertiary">
                {maxRetries != null
                  ? t("stageRetryAttempt", { n: a.attempt, max: maxRetries })
                  : t("stageAttempt", { n: a.attempt })}
              </Typography>
              {loopTo && (
                <Typography mono size="2xs" type="note" variant="tertiary">
                  {t("stageRetryLoopTo", { phase: loopTo })}
                </Typography>
              )}
            </Stack>
            <Typography mono size="2xs" tone="bad" type="note">
              {a.verdict ? t(`verdict.${a.verdict}`) : t(`state.${a.status}`)}
            </Typography>
          </Stack>
        ))}
        {escalated && (
          <Stack align="center" direction="row" gap="75">
            <Icon name="warn" size="xs" tone="warn" />
            <Typography mono size="2xs" tone="warn" type="note" weight="semibold">
              {t("stageRetryEscalated")}
            </Typography>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}

/**
 * Phase 36: a pipeline run's detail surface IS its stage timeline — a VERTICAL
 * timeline, one node per pipeline PHASE (not per attempt), connected by a rail whose
 * dot + connector read the phase's state at a glance (matte, glowing/pulsing only on
 * the live phase). Each node shows the phase's agent (avatar + name), state, elapsed
 * cost, its produced hand-off file once done, a nested retry block when it looped, and
 * an expandable log (opened via a labeled control — Law 4: nothing interactive is
 * unlabeled, so the design's bare chevron becomes a real button). Mirrors
 * `GoalDetailPanel`'s iteration timeline so a pipeline run is "always answerable"
 * without leaving the task detail.
 */
export function PipelineStageTimeline({
  pipelineRunId,
  owner,
  stageRuns,
  currentStage,
  live = false,
  parked,
}: PipelineStageTimelineProps) {
  const t = useTranslations("runs");
  const router = useRouter();
  const { data: pipelines } = usePipelinesQuery();
  const { data: agents } = useAgentsQuery();

  const pipelineDef = useMemo(
    () => pipelines?.find((p) => p.id === owner),
    [pipelines, owner],
  );
  const phaseById = useMemo(
    () => new Map((pipelineDef?.phases ?? []).map((p) => [p.id, p] as const)),
    [pipelineDef],
  );
  const agentsById = useMemo(() => new Map((agents ?? []).map((a) => [a.id, a] as const)), [
    agents,
  ]);
  const definedPhaseIds = useMemo(
    () => pipelineDef?.phases.map((p) => p.id).filter((id): id is string => !!id),
    [pipelineDef],
  );

  const nodes = useMemo(
    () => buildPhaseNodes(stageRuns, currentStage, live, definedPhaseIds),
    [stageRuns, currentStage, live, definedPhaseIds],
  );

  // Which stage's log is expanded (`"${phaseId}#${attempt}"`), or null. Single open ⇒
  // at most one stage-log fetch live.
  const [openLog, setOpenLog] = useState<string | null>(null);
  // The live phase opens by default so its log streams without a click; an explicit
  // toggle takes over from there (collapsing it falls back to the live phase again).
  const liveKey =
    live && currentStage
      ? `${currentStage}#${(stageRuns ?? []).filter((s) => s.phaseId === currentStage).length + 1}`
      : null;
  const openKey = openLog ?? liveKey;

  // Link to the pipeline *definition* (a different surface than this run). Hidden when
  // the owner id isn't known yet (e.g. a goal's maker run aggregate still loading).
  const openPipelineLink = owner ? (
    <Stack direction="row" justify="end">
      <Button
        icon="flow"
        intent="ghost"
        onClick={() => router.push(`/pipelines/${owner}`)}
        size="sm"
      >
        {t("openPipeline")}
      </Button>
    </Stack>
  ) : null;

  return (
    <HudPanel padding="250" title={t("stageTimeline")}>
      {nodes.length === 0 ? (
        <Stack gap="100">
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("stageNone")}
          </Typography>
          {openPipelineLink}
        </Stack>
      ) : (
        <Stack data-testid={PipelineStageTimelineTestId.Root} gap="0">
          {nodes.map((node, i) => {
            const isLastNode = i === nodes.length - 1;
            const isPlaceholder = node.main === null;
            // A not-yet-reached phase reads as `scheduled`'s matte/idle dot+badge —
            // reusing the shared map (never forking it), just with its own label.
            const displayStatus: FeedStatus = node.main?.status ?? "scheduled";
            const meta = RUN_STATE[displayStatus];
            const phaseDef = phaseById.get(node.phaseId);
            const agentId = phaseDef?.agent;
            const agent = agentId ? agentsById.get(agentId) : undefined;
            const glyph: IconName =
              (agent?.glyph as IconName | undefined) ??
              (phaseDef?.type === "verify" ? "check" : "bot");
            const agentName = agent?.name ?? agentId ?? node.phaseId;
            const running = displayStatus === "running";

            const attempts = node.main ? [...node.priorAttempts, node.main] : node.priorAttempts;
            const costs = attempts.map((a) => a.costUsd).filter((c): c is number => c != null);
            const totalCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : undefined;

            const hasLog = !isPlaceholder;
            const key = node.main ? `${node.phaseId}#${node.main.attempt}` : node.phaseId;
            const isOpen = hasLog && openKey === key;
            const logId = `stage-log-${key.replace("#", "-")}`;

            const produced =
              displayStatus === "done" && phaseDef?.type !== "verify"
                ? phaseDef?.produces
                : undefined;

            const escalated = !isPlaceholder && parked?.phaseId === node.phaseId;
            const showRetry = node.priorAttempts.length > 0 || escalated;

            return (
              <Stack direction="row" gap="150" key={node.phaseId}>
                <Stack align="center" direction="col" gap="0">
                  <StatusDot pulse={meta.pulse} size="150" tone={meta.dot} />
                  {!isLastNode && (
                    <Container
                      aria-hidden="true"
                      data-testid={PipelineStageTimelineTestId.Connector}
                      style={{
                        background: displayStatus === "done" ? stateToneVar.ok : "var(--color-border)",
                        flexGrow: 1,
                        marginTop: "0.375rem",
                        minHeight: "1rem",
                        width: "1.5px",
                      }}
                    />
                  )}
                </Stack>

                <Container grow minW0 style={{ paddingBottom: isLastNode ? "0" : "1.5rem" }}>
                  <Stack gap="50">
                    {(() => {
                      const header = (
                        <Stack align="center" direction="row" gap="100" justify="between">
                          <Container grow minW0>
                            <Stack align="center" direction="row" gap="100">
                              <IconTile
                                glyph={glyph}
                                size="sm"
                                src={agent?.avatar}
                                style={
                                  running
                                    ? { boxShadow: `0 0 0 1px ${stateToneVar.run}` }
                                    : undefined
                                }
                                tone="accent"
                              />
                              <Typography mono truncate size="sm" type="note" weight="semibold">
                                {agentName}
                              </Typography>
                            </Stack>
                          </Container>
                          <Stack align="center" direction="row" gap="100" shrink={false}>
                            {totalCost != null && (
                              <Typography mono size="2xs" type="note" variant="tertiary">
                                {formatCostUsd(totalCost)}
                              </Typography>
                            )}
                            {node.main?.verdict && (
                              <Tag
                                data-testid={`stage-verdict-${node.main.verdict}`}
                                size="sm"
                                tone={node.main.verdict === "pass" ? "ok" : "warn"}
                              >
                                {t(`verdict.${node.main.verdict}`)}
                              </Tag>
                            )}
                            <RunStateBadge
                              canonTitle={isPlaceholder ? undefined : displayStatus}
                              label={
                                isPlaceholder ? t("stageWaitingLabel") : t(`state.${displayStatus}`)
                              }
                              status={displayStatus}
                            />
                            {hasLog && (
                              <Icon
                                className={cn(
                                  "transition-transform duration-150",
                                  isOpen && "rotate-90",
                                )}
                                name="chevron"
                                size="xs"
                                tone="faint"
                              />
                            )}
                          </Stack>
                        </Stack>
                      );
                      // The whole phase-row header is the accordion toggle — Law 4: it's a
                      // labeled button (aria-label/expanded/controls) with a focus-visible
                      // ring, so the log opens on a click or keyboard Enter anywhere on the
                      // row. A placeholder phase has no log, so it stays a plain, inert row.
                      return hasLog ? (
                        <Pressable
                          aria-controls={logId}
                          aria-expanded={isOpen}
                          aria-label={t("togglePhaseLog")}
                          data-testid={PipelineStageTimelineTestId.RowToggle}
                          onClick={() => setOpenLog(isOpen ? "" : key)}
                          style={{ display: "block", width: "100%" }}
                        >
                          {header}
                        </Pressable>
                      ) : (
                        header
                      );
                    })()}

                    {produced && (
                      <Stack align="center" direction="row" gap="75">
                        <Icon name="file" size="xs" tone="ok" />
                        <Typography mono size="2xs" tone="ok" type="note">
                          {produced}
                        </Typography>
                      </Stack>
                    )}

                    {isPlaceholder && (
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {t("stageWaitingBody")}
                      </Typography>
                    )}

                    {showRetry && (
                      <RetryBlock
                        attempts={node.priorAttempts}
                        escalated={escalated}
                        loopTo={phaseDef?.loop?.to}
                        maxRetries={phaseDef?.loop?.maxRetries}
                      />
                    )}

                    {isOpen && node.main && (
                      <Container id={logId}>
                        <StageLog
                          live={node.main.status === "running"}
                          phaseId={node.phaseId}
                          pipelineRunId={pipelineRunId}
                        />
                      </Container>
                    )}
                  </Stack>
                </Container>
              </Stack>
            );
          })}
          {openPipelineLink}
        </Stack>
      )}
    </HudPanel>
  );
}
