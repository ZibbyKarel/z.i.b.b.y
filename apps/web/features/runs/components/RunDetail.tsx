import {
  Accordion,
  AccordionItem,
  Button,
  CodeBlock,
  Container,
  FilePreview,
  type IconName,
  IconTile,
  Markdown,
  Pressable,
  SelectField,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { formatCostUsd } from "../../../utils/cost";
import { formatDuration, relativeTime, resumeEta } from "../../../utils/time";
import { useApprovalsQuery } from "../../approvals";
import { RiskBadge } from "../../approvals/components/RiskBadge";
import { SeverityMeter } from "../../approvals/components/SeverityMeter";
import { useNewTask } from "../../tasks";
import { useProjectsQuery } from "../../projects";
import { useAssignRunProjectMutation } from "../mutations";
import { useRunArtifactQuery } from "../queries/useRunArtifactQuery";
import {
  type RunView,
  approvalForRun,
  isMarkdownFilename,
  isStoppableRun,
  runStateTone,
  runTitle,
} from "../run";
import { ChainStepsPanel } from "./ChainStepsPanel";
import { GoalDetailPanel } from "./GoalDetailPanel";
import { PipelineStageTimeline } from "./PipelineStageTimeline";
import { RunApprovalGate } from "./RunApprovalGate";
import { RunLogStream } from "./RunLogStream";
import { RunParkedPanel } from "./RunParkedPanel";
import { RunPrGatePanel } from "./RunPrGatePanel";
import { RunStateBadge } from "./RunStateBadge";

export interface RunDetailProps {
  run: RunView;
  glyph: IconName;
  /** The assigned agent/pipeline's avatar, shown in the header in place of the
   * glyph (which is the fallback when this is absent) — Phase 48. */
  avatar?: string;
  now: number;
  onStop: () => void;
  stopping: boolean;
  onDelete: () => void;
  deleting: boolean;
}

/**
 * The "paused on a usage limit" notice — a pause, not a failure (Phase 9). Shared by
 * agent, pipeline, and goal runs (it was three inline copies); shows the reset ETA and,
 * when present, how many auto-resume cycles have been spent.
 */
function LimitPausedPanel({ run, now }: { run: RunView; now: number }) {
  const t = useTranslations("runs");
  const locale = useLocale();
  return (
    <HudPanel padding="300" tone="warn">
      <Stack align="start" direction="row" gap="150">
        <IconTile glyph="pause" size="md" />
        <Stack gap="50">
          <Typography type="note" weight="semibold">
            {t("limitPausedTitle")}
          </Typography>
          <Typography leading="snug" size="sm" type="text" variant="secondary">
            {t("limitPausedBody", { eta: resumeEta(run.resumeAt, now, locale) })}
          </Typography>
          {run.limitResumeCycles != null && run.limitResumeCycles > 0 && (
            <Typography mono size="2xs" type="note" variant="tertiary">
              {t("limitResumeCycles", { n: run.limitResumeCycles })}
            </Typography>
          )}
        </Stack>
      </Stack>
    </HudPanel>
  );
}

/** How many characters of the task description show before "show more". */
const DESCRIPTION_PREVIEW = 180;

/**
 * The task's free-text description, truncated to a preview with a "show more /
 * show less" toggle (classic collapse). Shown in the run header for runs born from
 * a task whose description carries more than the headline — most visibly pipeline
 * runs, whose `prompt` is only the current-phase string, not the task text.
 */
function TaskDescription({ text }: { text: string }) {
  const t = useTranslations("runs");
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > DESCRIPTION_PREVIEW;
  const shown = !isLong || expanded ? text : `${text.slice(0, DESCRIPTION_PREVIEW).trimEnd()}…`;
  return (
    <Stack align="start" gap="25">
      <Typography leading="snug" size="sm" type="text" variant="secondary">
        {shown}
      </Typography>
      {isLong && (
        <Pressable onClick={() => setExpanded((v) => !v)}>
          <Typography size="xs" tone="accent" type="note" weight="semibold">
            {expanded ? t("showLess") : t("showMore")}
          </Typography>
        </Pressable>
      )}
    </Stack>
  );
}

function MetaCell({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  tone?: "accent" | "ok";
  /** Bumps the value's size so it reads as the standout figure of the strip (the cost). */
  emphasize?: boolean;
}) {
  return (
    <Stack gap="25">
      <Typography
        mono
        uppercase
        size="2xs"
        tracking="wide"
        type="note"
        variant="tertiary"
      >
        {label}
      </Typography>
      <Typography
        mono
        size={emphasize ? "md" : "sm"}
        tone={tone}
        type="note"
        weight={emphasize ? "bold" : "semibold"}
      >
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * "Zařadit do projektu" — Phase 24 Part D's reassignment control, shown in place of
 * the project meta cell for a "bez projektu" run. A plain project pick (no "clear"
 * entry — the run is already project-less); choosing one fires
 * `useAssignRunProjectMutation`, which invalidates the feed so the run's own meta
 * cell takes over on the next render. Renders nothing when the registry is empty
 * (there is nothing to assign into).
 */
function AssignProjectControl({ runId }: { runId: string }) {
  const t = useTranslations("runs");
  const { data: projects = [] } = useProjectsQuery();
  const assign = useAssignRunProjectMutation();
  const [value, setValue] = useState("");

  if (projects.length === 0) return null;

  const options = [
    { value: "", label: t("assignProjectPlaceholder") },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <Container width="14rem">
      <SelectField
        hint={t("assignProjectHint")}
        label={t("assignProjectLabel")}
        onValueChange={(v) => {
          setValue(v);
          if (v) assign.mutate({ params: { runId }, body: { projectId: v } });
        }}
        options={options}
        value={value}
      />
    </Container>
  );
}

/** The first URL in a string — a PR link inside the outcome summary, if any. */
function firstUrl(text: string | undefined): string | undefined {
  return text?.match(/https?:\/\/\S+/)?.[0];
}

/** How much produced output is folded into a follow-up task's context (8000-char cap). */
const CONTINUE_CONTEXT_MAX = 1500;

/**
 * A completed task's produced output ("open output" + "continue in a new task"). Two
 * shapes, by where the output lives:
 *  - agent/orchestrator tasks with a chosen `pr`/`file` output → `taskOutcomeSummary`
 *    carries the reference (a PR url opens in a new tab, a file note is shown);
 *  - a done pipeline run → its `pr-draft.md` + `diffstat.txt` artifacts (the delivery
 *    loop's actual output), reusing {@link RunPrGatePanel}.
 * Either way, "continue" seeds a fresh task with the output folded into its context.
 * Renders nothing when there is no surfaced output.
 */
function RunOutputPanel({ run }: { run: RunView }) {
  const t = useTranslations("runs");
  const { open: openNewTask } = useNewTask();

  const summary = run.taskOutcomeSummary;
  // A pipeline run's own artifacts (below) are its output — the agent-shaped branch
  // (a generic `taskOutcomeSummary` string like "5 stages, done") must never apply to
  // one, even when its artifact hasn't arrived yet (P2-T2 bugfix).
  const agentOutput =
    run.status === "done" &&
    run.kind !== "pipeline" &&
    !!summary &&
    (run.taskOutputKind === "pr" || run.taskOutputKind === "file");
  const pipelineDone = run.status === "done" && run.kind === "pipeline";

  // The pipeline's produced PR draft — shown by RunPrGatePanel below and reused as the
  // continue-context. Same query key, so this shares RunPrGatePanel's cache (no extra
  // fetch); gated so non-pipeline runs never request it.
  const { data: prDraft } = useRunArtifactQuery(run.runId, "pr-draft.md", pipelineDone);
  // A `file`-output pipeline run's named artifact (P2-T1's `outputArtifactName`) — no
  // `pr-draft.md` is written for that shape, so this is the only way its output surfaces.
  const { data: fileArtifact } = useRunArtifactQuery(
    run.runId,
    run.outputArtifactName ?? "",
    pipelineDone && !!run.outputArtifactName,
  );
  const pipelineOutput = pipelineDone && !!(prDraft?.content || fileArtifact?.content);

  if (!agentOutput && !pipelineOutput) return null;

  const rawOutput = agentOutput
    ? (summary ?? "")
    : (prDraft?.content ?? fileArtifact?.content ?? "");
  const output =
    rawOutput.length > CONTINUE_CONTEXT_MAX
      ? `${rawOutput.slice(0, CONTINUE_CONTEXT_MAX)}…`
      : rawOutput;
  const context = [
    run.taskTitle ? t("continueContextTask", { title: run.taskTitle }) : null,
    t("continueContextOutput", { output }),
  ]
    .filter(Boolean)
    .join("\n");

  const continueButton = (
    <Button
      data-testid="continue-task"
      icon="plus"
      intent="ghost"
      onClick={() => openNewTask(undefined, undefined, context)}
      size="sm"
    >
      {t("continueTask")}
    </Button>
  );

  // Pipeline with a PR draft: the artifact view IS the openable output (incl. the
  // diffstat); "continue" sits beneath it.
  if (prDraft?.content) {
    return (
      <Stack gap="100">
        <RunPrGatePanel pipelineRunId={run.runId} title={t("producedOutputTitle")} />
        <Stack align="center" direction="row" gap="100">
          {continueButton}
        </Stack>
      </Stack>
    );
  }

  // Pipeline with a `file`-output artifact: no `RunPrGatePanel` (there is no diffstat,
  // no PR draft) — a lighter block with the same skeleton showing the artifact content.
  // The produced artifact is normally a markdown doc (a research report, an audit) —
  // rendered formatted via the DS Markdown viewer; a clearly non-markdown code file
  // (`.ts`, `.json`, …) keeps the plain CodeBlock (Phase 41).
  if (fileArtifact?.content) {
    return (
      <HudPanel padding="250" title={t("producedOutputTitle")}>
        <Stack gap="200">
          {isMarkdownFilename(run.outputArtifactName) ? (
            <Container maxHeight="340px" overflow="auto">
              <Markdown escapeHtml source={fileArtifact.content} />
            </Container>
          ) : (
            <CodeBlock maxHeight="md" text={fileArtifact.content} />
          )}
          <Stack align="center" direction="row" gap="100">
            {continueButton}
          </Stack>
        </Stack>
      </HudPanel>
    );
  }

  // Agent/orchestrator: the summary reference, with a PR url opened in a new tab.
  const url = firstUrl(summary);
  return (
    <HudPanel padding="250" title={t("producedOutputTitle")}>
      <Stack gap="100">
        <CodeBlock maxHeight="md" text={summary ?? ""} />
        <Stack wrap align="center" direction="row" gap="100">
          {url && (
            <Button
              data-testid="open-output"
              icon="link"
              intent="primary"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              size="sm"
            >
              {t("openOutput")}
            </Button>
          )}
          {continueButton}
        </Stack>
      </Stack>
    </HudPanel>
  );
}

/**
 * The task's uploaded attachments, read-only (no remove affordance) — the run detail
 * only displays what was attached at creation time. Renders nothing when the task
 * carries no attachments.
 */
function RunAttachmentsPanel({ run }: { run: RunView }) {
  const tAttach = useTranslations("tasks.attachments");
  if (!run.attachments || run.attachments.length === 0) return null;
  return (
    <HudPanel padding="250" title={tAttach("sectionTitle")}>
      <Stack gap="100">
        {run.attachments.map((a) => (
          <FilePreview key={a.name} mediaType={a.mediaType} name={a.name} size={a.size} />
        ))}
      </Stack>
    </HudPanel>
  );
}

/**
 * Run detail: one header + meta strip, then the live log (or, for pipelines, a
 * link out). A run paused on the approval gate folds the approval into this same
 * header (severity + risk type + request meta — there is no second header), shows
 * the decision panel with the action summary and Potvrdit/Smazat footer, and
 * collapses the log into an accordion so the decision is what's visible.
 */
export function RunDetail({
  run,
  glyph,
  avatar,
  now,
  onStop,
  stopping,
  onDelete,
  deleting,
}: RunDetailProps) {
  const t = useTranslations("runs");
  const tApprovals = useTranslations("approvals");
  const tk = useTranslations();
  // Stop/Delete are destructive (a running task's progress is lost; a done run's
  // artifacts are erased) — both ask via the shared ConfirmDeleteDialog before the
  // mutation fires (Phase 18).
  const [confirmKind, setConfirmKind] = useState<"stop" | "delete" | null>(null);
  const { data: queue = [] } = useApprovalsQuery();
  const approval = approvalForRun(queue, run);
  // Who is doing the work: an agent run's `owner` is its agent id; the approval
  // (when present) carries the nicer display name. Surfaced in the header so a
  // paused task makes plain which agent is asking.
  const agentName = run.kind === "agent" ? (approval?.skill ?? run.owner) : undefined;

  // Single-sourced from `RUN_STATE` (via `runStateTone`) so the header's tone
  // agrees exactly with the state chip and the card's edge/progress accent —
  // `running` reads as the distinct `run` blue, never the generic `accent`.
  const tone = runStateTone(run.status);
  const ago = (n: number, unit: string) =>
    n === 0 ? t("agoNow") : unit === "m" ? t("agoM", { n }) : t("agoH", { n });

  // A waiting scheduled task fires in the future — its time reads "in …".
  const inMin = Math.floor((Date.parse(run.startedAt) - now) / 60000);
  const startedValue =
    run.status === "scheduled" && inMin >= 1
      ? inMin < 60
        ? t("inM", { n: inMin })
        : t("inH", { n: Math.floor(inMin / 60) })
      : relativeTime(run.startedAt, now, ago);

  // Total wall-clock time from dispatch to the written-back outcome — only once the
  // task's outcome carries a `finishedAt` (absent for a run still in flight, or one
  // with no owning task to write an outcome back onto).
  const durationMs = run.taskOutcomeFinishedAt
    ? Date.parse(run.taskOutcomeFinishedAt) - Date.parse(run.startedAt)
    : undefined;

  const headline = runTitle(run);

  // A pipeline run's `prompt` is only the "fáze: X" progress string, which the stage
  // timeline below already shows — so the header subtitle is the prompt for the other
  // kinds (an agent's prompt), suppressed for pipelines.
  const subtitle =
    run.kind === "pipeline" ? "" : run.prompt && run.prompt !== headline ? run.prompt : "";
  // The task's free-text description, shown (collapsed) only when it adds something
  // beyond the headline and the subtitle — so the task name isn't repeated.
  const descriptionText =
    run.taskText && run.taskText !== headline && run.taskText !== subtitle ? run.taskText : "";

  // Pipeline runs render their own stage timeline (below); this is the log for the
  // kinds that have a single one (agent/skill) or a scheduled task's note.
  const logPanel = run.logBase ? (
    <RunLogStream
      linesLabel={(n) => t("lines", { n })}
      live={run.status === "running"}
      liveLabel={t("liveLog")}
      logLabel={t("log")}
      pct={run.status === "done" ? 100 : run.pct}
      runId={run.runId}
      tone={tone ?? "accent"}
    />
  ) : (
    <Typography mono size="sm" type="note" variant="secondary">
      {t("scheduledNote")}
    </Typography>
  );

  return (
    <>
      <Stack gap="200">
        <HudPanel padding="300" tone={tone}>
          <Stack gap="200">
            <Stack wrap align="start" direction="row" gap="150" justify="between">
              <Container minW0>
                <Stack gap="50">
                  <Stack wrap align="center" direction="row" gap="100">
                    <Typography type="subtitle" weight="semibold">
                      {headline}
                    </Typography>
                    <RunStateBadge
                      canonTitle={run.status}
                      label={t(`state.${run.status}`)}
                      size="md"
                      status={run.status}
                    />
                  </Stack>
                  {subtitle && (
                    <Typography leading="snug" size="sm" type="text" variant="secondary">
                      {subtitle}
                    </Typography>
                  )}
                  {descriptionText && <TaskDescription text={descriptionText} />}
                  {/* id · kind · agent X (v-runs.png) — the routed agent's name folds
                      into this one meta line instead of a second, separate chip. */}
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {run.runId} · {t(`kind.${run.kind}`)}
                    {agentName ? ` · ${t("metaAgent")} ${agentName}` : ""}
                  </Typography>
                </Stack>
              </Container>
              {/* The actions/approval sit between the title block and the assigned
                  entity's avatar, which is the rightmost element of the header
                  (Phase 48 — glyph is the avatar's fallback via IconTile `src`). */}
              <Stack align="center" direction="row" gap="150">
                {approval ? (
                  // While the run waits on the gate, the header carries the approval's
                  // severity + risk type; deciding happens in the panel below.
                  <Stack align="center" direction="row" gap="150">
                    <SeverityMeter
                      showLabel
                      label={tApprovals(`severity.${approval.risk}`)}
                      severity={approval.risk}
                    />
                    <RiskBadge
                      label={approval.riskType ? tApprovals(`risk.${approval.riskType}`) : ""}
                      size="md"
                      type={approval.riskType}
                    />
                  </Stack>
                ) : (
                  <Stack align="center" direction="row" gap="100">
                    {isStoppableRun(run) && (
                      <Button
                        disabled={stopping}
                        icon="stop"
                        intent="danger"
                        onClick={() => setConfirmKind("stop")}
                        size="sm"
                      >
                        {t("stop")}
                      </Button>
                    )}
                    <Button
                      disabled={deleting}
                      icon="x"
                      intent="danger"
                      onClick={() => setConfirmKind("delete")}
                      size="sm"
                    >
                      {run.status === "scheduled" ? t("cancelTask") : t("delete")}
                    </Button>
                  </Stack>
                )}
                <IconTile
                  data-testid="run-header-avatar"
                  glyph={glyph}
                  size="lg"
                  src={avatar}
                />
              </Stack>
            </Stack>

            <Stack wrap direction="row" gap="300">
              {run.projectId ? (
                <MetaCell label={t("metaProject")} tone="accent" value={run.project} />
              ) : (
                <AssignProjectControl runId={run.runId} />
              )}
              <MetaCell
                label={run.status === "scheduled" ? t("metaScheduled") : t("metaStarted")}
                value={startedValue}
              />
              {run.owner && run.kind !== "agent" && (
                <MetaCell
                  label={run.kind === "pipeline" ? t("metaPipeline") : t("metaTarget")}
                  tone={run.kind === "pipeline" ? "accent" : undefined}
                  value={run.owner}
                />
              )}
              {/* The task name is already the headline — only repeat it here when it
                differs, and then carry the written-back outcome it uniquely holds. */}
              {run.taskTitle && run.taskTitle !== headline && (
                <MetaCell
                  label={t("metaTask")}
                  value={
                    run.taskOutcome
                      ? `${run.taskTitle} → ${t(`taskOutcome.${run.taskOutcome}`)}`
                      : run.taskTitle
                  }
                />
              )}
              {run.costUsd != null && (
                <MetaCell
                  emphasize
                  label={t("metaCost")}
                  tone="ok"
                  value={formatCostUsd(run.costUsd)}
                />
              )}
              {durationMs != null && (
                <MetaCell label={t("metaDuration")} value={formatDuration(durationMs)} />
              )}
              {approval && (
                <MetaCell
                  label={tApprovals("requestedLabel")}
                  value={new Date(approval.requestedAt).toLocaleString("cs")}
                />
              )}
              {approval?.via && <MetaCell label={tApprovals("viaLabel")} value={approval.via} />}
            </Stack>
          </Stack>
        </HudPanel>

        <RunOutputPanel run={run} />
        <RunAttachmentsPanel run={run} />

        {approval ? (
          <>
            {/* A pipeline run parked on the PR gate shows what's about to be published
              (the draft + diffstat) above the generic confirm/discard panel. */}
            {run.kind === "pipeline" &&
              (approval.action === "pr.open" || approval.action === "git.push") && (
                <RunPrGatePanel pipelineRunId={run.runId} />
              )}
            <RunApprovalGate approval={approval} />
            <Accordion>
              <AccordionItem summary={t("output")}>{logPanel}</AccordionItem>
            </Accordion>
          </>
        ) : run.kind === "goal" ? (
          // Phase 10: a goal run's surface IS its iteration timeline + cost bar (and,
          // when parked, the resume-with-note panel) — there is no per-run log.
          <>
            {run.status === "paused-limit" && <LimitPausedPanel now={now} run={run} />}
            <GoalDetailPanel run={run} />
          </>
        ) : run.kind === "chain" ? (
          // Phase 05: a chain run folds its steps the same way a goal folds its
          // maker/verifier iterations — each step's runRef is a pipeline run with its
          // own stage timeline.
          <ChainStepsPanel run={run} />
        ) : run.kind === "pipeline" ? (
          // Phase 28: a pipeline run's surface IS its stage timeline (each phase's log is
          // openable). A paused-limit / retries-parked run shows its notice above it.
          <>
            {run.status === "paused-limit" && <LimitPausedPanel now={now} run={run} />}
            {run.status === "parked" && run.parked && <RunParkedPanel run={run} />}
            <PipelineStageTimeline
              currentStage={run.currentStage}
              live={run.status === "running"}
              owner={run.owner}
              parked={run.parked}
              pipelineRunId={run.runId}
              stageRuns={run.stageRuns}
            />
          </>
        ) : run.status === "paused-limit" ? (
          <>
            <LimitPausedPanel now={now} run={run} />
            <Accordion>
              <AccordionItem summary={t("output")}>{logPanel}</AccordionItem>
            </Accordion>
          </>
        ) : (
          <HudPanel
            padding={run.logBase ? "250" : "300"}
            title={run.logBase ? t("output") : undefined}
          >
            {logPanel}
          </HudPanel>
        )}

        {run.checkpoints && run.checkpoints.length > 0 && (
          <HudPanel padding="250" title={t("checkpoints")}>
            <Stack gap="50">
              {run.checkpoints.map((c) => (
                <Typography
                  mono
                  key={`${c.phaseId}-${c.sha}`}
                  size="2xs"
                  type="note"
                  variant="tertiary"
                >
                  {c.phaseId} · {c.sha}
                </Typography>
              ))}
            </Stack>
          </HudPanel>
        )}
      </Stack>

      {confirmKind === "stop" && (
        <ConfirmDeleteDialog
          body={t("stopBody")}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("stop")}
          icon="stop"
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            setConfirmKind(null);
            onStop();
          }}
          pending={stopping}
          title={t("stopTitle")}
        />
      )}
      {confirmKind === "delete" && (
        <ConfirmDeleteDialog
          body={run.status === "scheduled" ? t("cancelBody") : t("deleteBody")}
          cancelLabel={tk("common.cancel")}
          confirmLabel={run.status === "scheduled" ? t("cancelTask") : t("delete")}
          onCancel={() => setConfirmKind(null)}
          onConfirm={() => {
            setConfirmKind(null);
            onDelete();
          }}
          pending={deleting}
          title={run.status === "scheduled" ? t("cancelTitle") : t("deleteTitle")}
        />
      )}
    </>
  );
}
