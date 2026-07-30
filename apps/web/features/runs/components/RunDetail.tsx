import { SUBSYSTEMS } from "@zibby/contracts";
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CodeBlock,
  Container,
  Divider,
  EntityHero,
  FilePreview,
  Icon,
  type IconName,
  IconTile,
  Markdown,
  MenuButton,
  type MenuButtonItem,
  Pressable,
  SelectField,
  Stack,
  Tag,
  Typography,
} from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { API_URL } from "../../../state/api";
import { formatCostUsd } from "../../../utils/cost";
import { formatDuration, resumeEta } from "../../../utils/time";
import { useApprovalsQuery } from "../../approvals";
import { RiskBadge } from "../../approvals/components/RiskBadge";
import { SeverityMeter } from "../../approvals/components/SeverityMeter";
import { useProjectsQuery } from "../../projects";
import { toClientTarget, useNewTask } from "../../tasks";
import { useAssignRunProjectMutation } from "../mutations";
import { useRunArtifactQuery } from "../queries/useRunArtifactQuery";
import {
  type RunView,
  approvalForRun,
  isMarkdownFilename,
  isResumableRun,
  isStoppableRun,
  runStateTone,
  runTitle,
} from "../run";
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
  /** Phase 49: re-run an errored/interrupted agent run (spawns a new run). Absent for
   * kinds/states that aren't re-runnable — the button then never shows. */
  onResume?: () => void;
  resuming?: boolean;
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

function MetaCell({
  label,
  value,
  tone,
  emphasize,
  onClick,
  testId,
}: {
  label: string;
  value: string;
  tone?: "accent" | "ok";
  /** Bumps the value's size so it reads as the standout figure of the strip (the cost). */
  emphasize?: boolean;
  /** Phase 63: when present, the value becomes a real, keyboard-focusable link to the
   * owning entity's detail page (a pipeline's own MetaCell) — absent for kinds/labels
   * that have no detail route, which stay plain text. */
  onClick?: () => void;
  testId?: string;
}) {
  const valueNode = (
    <Typography
      mono
      size={emphasize ? "md" : "sm"}
      tone={tone}
      type="note"
      weight={emphasize ? "bold" : "semibold"}
    >
      {value}
    </Typography>
  );
  return (
    <Stack gap="25">
      <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
        {label}
      </Typography>
      {onClick ? (
        <Pressable data-testid={testId} onClick={onClick}>
          {valueNode}
        </Pressable>
      ) : (
        valueNode
      )}
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

/** The Phase 65 open-file serve URL for one attachment (`GET /api/tasks/attachments/:setId/:name`). */
function attachmentOpenHref(attachmentSetId: string, name: string): string {
  return `${API_URL}/api/tasks/attachments/${attachmentSetId}/${encodeURIComponent(name)}`;
}

/** How much produced output is folded into a follow-up task's context (8000-char cap). */
const CONTINUE_CONTEXT_MAX = 1500;

/**
 * The PR output surface: a task whose output opened a PR (Tier-2, no gate). Just the
 * link and the branch's coloured `+/−` line totals — deliberately nothing else (no
 * draft, no diffstat, no repeat of the last phase's log; those live in the timeline).
 */
function PrOutputCard({
  prOutput,
  title,
}: {
  prOutput: NonNullable<RunView["prOutput"]>;
  title: string;
}) {
  const t = useTranslations("runs");
  return (
    <HudPanel padding="250" title={title}>
      <Stack wrap align="center" direction="row" gap="200">
        <Button
          data-testid="open-pr"
          icon="link"
          intent="primary"
          onClick={() => window.open(prOutput.url, "_blank", "noopener,noreferrer")}
          size="sm"
        >
          {t("openPr")}
        </Button>
        <Stack align="center" direction="row" gap="100">
          <Typography
            aria-label={t("prAdded", { n: prOutput.additions })}
            data-testid="pr-additions"
            tone="ok"
            type="data"
          >
            {`+${prOutput.additions}`}
          </Typography>
          <Typography
            aria-label={t("prRemoved", { n: prOutput.deletions })}
            data-testid="pr-deletions"
            tone="bad"
            type="data"
          >
            {`−${prOutput.deletions}`}
          </Typography>
        </Stack>
      </Stack>
    </HudPanel>
  );
}

/**
 * A completed task's produced output. Three shapes, by what the task produced:
 *  - a PR (agent OR pipeline, `prOutput` set) → just the PR link + the coloured `+/−`
 *    branch line totals (no draft, no diffstat, no phase log) — the {@link PrOutputCard};
 *  - a `file`-output pipeline run → its named artifact, rendered as markdown/code;
 *  - an agent/orchestrator `file` reference → `taskOutcomeSummary`.
 * Non-PR shapes also offer "continue" (seed a fresh task with the output folded in).
 * Renders nothing when there is no surfaced output.
 */
function RunOutputPanel({ run }: { run: RunView }) {
  const t = useTranslations("runs");
  const { open: openNewTask } = useNewTask();

  const summary = run.taskOutcomeSummary;
  // A PR output (agent or pipeline) short-circuits to the compact card below; skip the
  // artifact fetches (there is no draft/diffstat to show for it anymore).
  const isPrOutput = !!run.prOutput;
  // A pipeline run's own artifacts (below) are its output — the agent-shaped branch
  // (a generic `taskOutcomeSummary` string like "5 stages, done") must never apply to
  // one, even when its artifact hasn't arrived yet (P2-T2 bugfix).
  const agentOutput =
    !isPrOutput &&
    run.status === "done" &&
    run.kind !== "pipeline" &&
    !!summary &&
    (run.taskOutputKind === "pr" || run.taskOutputKind === "file");
  const pipelineDone = !isPrOutput && run.status === "done" && run.kind === "pipeline";

  // A legacy pipeline PR (no `prOutput`) still surfaces its `pr-draft.md` here; a new PR
  // never fetches it. Same query key as RunPrGatePanel, so the cache is shared.
  const { data: prDraft } = useRunArtifactQuery(run.runId, "pr-draft.md", pipelineDone);
  // A `file`-output pipeline run's named artifact (P2-T1's `outputArtifactName`) — no
  // `pr-draft.md` is written for that shape, so this is the only way its output surfaces.
  const { data: fileArtifact } = useRunArtifactQuery(
    run.runId,
    run.outputArtifactName ?? "",
    pipelineDone && !!run.outputArtifactName,
  );
  const pipelineOutput = pipelineDone && !!(prDraft?.content || fileArtifact?.content);

  // A PR output (Tier-2, opened immediately): just the link and the coloured line
  // totals — nothing duplicated from the phase log or a draft.
  if (run.prOutput) {
    return <PrOutputCard prOutput={run.prOutput} title={t("producedOutputTitle")} />;
  }

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

export enum ClassificationTracePanelTestId {
  Panel = "classification-trace",
  Confidence = "classification-confidence",
}

/**
 * F2c — the switchboard's stage-1 classification trace: a minimal, read-only
 * "why" strip — `Switchboard → <subsystem> → <unit>` (the middle hop only when
 * stage-1 delegated to a subsystem; `stage1` itself already names the concrete
 * unit otherwise) plus the verdict's reason and confidence. Renders nothing
 * when the run carries no trace — an explicitly-targeted task was never
 * classified, and a pre-F2c run wrote none.
 */
function ClassificationTracePanel({ run }: { run: RunView }) {
  const t = useTranslations("runs");
  const classification = run.classification;
  if (!classification) return null;
  const stage1 = toClientTarget(classification.stage1);
  const subsystemName = classification.subsystem
    ? (SUBSYSTEMS.find((s) => s.id === classification.subsystem)?.name ?? classification.subsystem)
    : null;
  // When stage-1 delegated to a subsystem, the dispatched unit is whatever the
  // run actually resolved to (`processor`); otherwise stage-1's own pick already
  // IS the unit that ran.
  const unitName = subsystemName ? (run.processor?.name ?? run.owner) : stage1.name;
  return (
    <HudPanel padding="250" title={t("classificationTitle")}>
      <Stack data-testid={ClassificationTracePanelTestId.Panel} gap="100">
        <Stack wrap align="center" direction="row" gap="100">
          <Typography mono size="xs" type="note" variant="secondary">
            {t("classificationSwitchboard")}
          </Typography>
          <Icon name="chevron" size="xs" tone="faint" />
          {subsystemName && (
            <>
              <Typography mono size="xs" type="note" variant="secondary">
                {subsystemName}
              </Typography>
              <Icon name="chevron" size="xs" tone="faint" />
            </>
          )}
          <Stack align="center" direction="row" gap="50">
            <Icon name={stage1.glyph} size="xs" tone="accent" />
            <Typography mono size="xs" type="note" weight="semibold">
              {unitName}
            </Typography>
          </Stack>
        </Stack>
        <Typography leading="snug" size="sm" type="text" variant="secondary">
          {classification.reason}
        </Typography>
        <Tag data-testid={ClassificationTracePanelTestId.Confidence} size="sm" tone="neutral">
          {t("classificationConfidence", { pct: Math.round(classification.confidence * 100) })}
        </Tag>
      </Stack>
    </HudPanel>
  );
}

/**
 * The task's complete input — Phase 64: pulled out of the header (where long
 * descriptions crowded the state/meta strip) into its own default-collapsed
 * "Vstup" accordion below it, so a long task never inflates the header. Shows the
 * full `taskText` as formatted markdown, then the attachments list. Phase 65: when the
 * run carries an `attachmentSetId`, each attachment opens the file (in a new tab) via
 * the serve route — older runs with no set id keep the plain read-only row (DS
 * `FilePreview` has no `onOpen`/`href` prop, and it's out of this phase's scope to add
 * one, so the open affordance is a plain anchor wrapping the preview, styled with DS
 * focus-ring/utility classes rather than a new DS primitive). Renders nothing when
 * there is neither text nor an attachment to show.
 */
function RunInputSection({ run }: { run: RunView }) {
  const t = useTranslations("runs");
  const tAttach = useTranslations("tasks.attachments");
  const hasText = Boolean(run.taskText);
  const hasAttachments = Boolean(run.attachments && run.attachments.length > 0);
  if (!hasText && !hasAttachments) return null;
  const attachmentSetId = run.attachmentSetId;
  return (
    <Accordion>
      <AccordionItem summary={t("inputSection")}>
        <Stack gap="200">
          {hasText && <Markdown escapeHtml source={run.taskText ?? ""} />}
          {hasAttachments && (
            <Stack gap="100">
              <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
                {tAttach("sectionTitle")}
              </Typography>
              {(run.attachments ?? []).map((a) =>
                attachmentSetId ? (
                  <a
                    className="inline-block w-fit rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    data-testid="attachment-open-link"
                    href={attachmentOpenHref(attachmentSetId, a.name)}
                    key={a.name}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <FilePreview mediaType={a.mediaType} name={a.name} size={a.size} />
                  </a>
                ) : (
                  <FilePreview key={a.name} mediaType={a.mediaType} name={a.name} size={a.size} />
                ),
              )}
            </Stack>
          )}
        </Stack>
      </AccordionItem>
    </Accordion>
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
  onResume,
  resuming,
}: RunDetailProps) {
  const t = useTranslations("runs");
  const tApprovals = useTranslations("approvals");
  const tk = useTranslations();
  const router = useRouter();
  // Stop/Delete are destructive (a running task's progress is lost; a done run's
  // artifacts are erased) — both ask via the shared ConfirmDeleteDialog before the
  // mutation fires (Phase 18).
  const [confirmKind, setConfirmKind] = useState<"stop" | "delete" | null>(null);
  const { data: queue = [] } = useApprovalsQuery();
  const approval = approvalForRun(queue, run);
  // Shares the `["projects"]` cache with `AssignProjectControl` below — read here too
  // so the meta strip knows up front whether that control will render anything (it
  // renders null on an empty registry), which the divider layout needs to get right.
  const { data: projects = [] } = useProjectsQuery();
  // Who is doing the work: an agent run's `owner` is its agent id; the approval
  // (when present) carries the nicer display name. Surfaced in the header so a
  // paused task makes plain which agent is asking.
  const agentName = run.kind === "agent" ? (approval?.skill ?? run.owner) : undefined;

  // Single-sourced from `RUN_STATE` (via `runStateTone`) so the header's tone
  // agrees exactly with the state chip and the card's edge/progress accent —
  // `running` reads as the distinct `run` blue, never the generic `accent`.
  const tone = runStateTone(run.status);

  // A waiting scheduled task fires in the future — its time reads "in …". A started
  // run's time is always the absolute local date/time it started (never relative —
  // the operator asked for this explicitly), matching the approval requestedAt cell's
  // formatting below.
  const inMin = Math.floor((Date.parse(run.startedAt) - now) / 60000);
  const startedValue =
    run.status === "scheduled" && inMin >= 1
      ? inMin < 60
        ? t("inM", { n: inMin })
        : t("inH", { n: Math.floor(inMin / 60) })
      : new Date(run.startedAt).toLocaleString("cs");

  // Total wall-clock time from dispatch to the written-back outcome — only once the
  // task's outcome carries a `finishedAt` (absent for a run still in flight, or one
  // with no owning task to write an outcome back onto).
  const durationMs = run.taskOutcomeFinishedAt
    ? Date.parse(run.taskOutcomeFinishedAt) - Date.parse(run.startedAt)
    : undefined;

  // Phase 61: the header's Stop/Resume/Delete buttons collapse behind a single
  // kebab MenuButton — same guards as the inline buttons they replace, built
  // conditionally so an inapplicable action never shows a row.
  const actionItems: MenuButtonItem[] = [];
  if (isStoppableRun(run)) {
    actionItems.push({
      id: "stop",
      label: t("stop"),
      icon: "stop",
      danger: true,
      disabled: stopping,
      onSelect: () => setConfirmKind("stop"),
    });
  }
  if (onResume && isResumableRun(run)) {
    actionItems.push({
      id: "resume",
      label: run.sessionId ? t("resumeContinue") : t("resumeFresh"),
      icon: "run",
      disabled: resuming,
      onSelect: onResume,
    });
  }
  actionItems.push({
    id: "delete",
    label: run.status === "scheduled" ? t("cancelTask") : t("delete"),
    icon: "x",
    danger: true,
    disabled: deleting,
    onSelect: () => setConfirmKind("delete"),
  });

  const headline = runTitle(run);

  // A pipeline run's `prompt` is only the "fáze: X" progress string, which the stage
  // timeline below already shows — so the header subtitle is the prompt for the other
  // kinds (an agent's prompt), suppressed for pipelines.
  const subtitle =
    run.kind === "pipeline" ? "" : run.prompt && run.prompt !== headline ? run.prompt : "";

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

  // The meta strip's cells, built as a list (rather than left as loose conditional
  // JSX) so a vertical `Divider` can be threaded between exactly the cells that
  // actually render — including `AssignProjectControl`, which renders nothing on an
  // empty project registry (hence checking `projects.length` here, not just
  // `!run.projectId`). Keeps every existing stat and its conditional (Phase 62).
  const metaItems: ReactNode[] = [];
  if (run.projectId) {
    const projectId = run.projectId;
    metaItems.push(
      <MetaCell
        key="project"
        label={t("metaProject")}
        onClick={() => router.push(`/projects/${projectId}`)}
        testId="run-project-link"
        tone="accent"
        value={run.project}
      />,
    );
  } else if (projects.length > 0) {
    metaItems.push(<AssignProjectControl key="project" runId={run.runId} />);
  }
  // The roadmap issue this run was released for. Needs BOTH ids: the item id
  // addresses the dialog, the project id addresses the page that hosts the
  // roadmap tab (a roadmap is always project-scoped, so a run carrying one
  // without the other has nowhere to navigate to).
  if (run.roadmapItemId && run.projectId) {
    const { roadmapItemId, projectId } = run;
    metaItems.push(
      <MetaCell
        key="roadmapItem"
        label={t("metaRoadmapItem")}
        onClick={() => router.push(`/projects/${projectId}?tab=roadmap&item=${roadmapItemId}`)}
        testId="run-roadmap-item-link"
        tone="accent"
        value={run.roadmapItemLabel ?? roadmapItemId}
      />,
    );
  }
  metaItems.push(
    <MetaCell
      key="started"
      label={run.status === "scheduled" ? t("metaScheduled") : t("metaStarted")}
      value={startedValue}
    />,
  );
  if (run.owner && run.kind !== "agent") {
    // Phase 63: a pipeline's own name is a link to its detail page (a real, focusable
    // route) — goal/chain/orchestrator owners have no detail route, so they stay plain.
    const owner = run.owner;
    metaItems.push(
      <MetaCell
        key="owner"
        label={run.kind === "pipeline" ? t("metaPipeline") : t("metaTarget")}
        onClick={run.kind === "pipeline" ? () => router.push(`/pipelines/${owner}`) : undefined}
        testId={run.kind === "pipeline" ? "run-owner-link" : undefined}
        tone={run.kind === "pipeline" ? "accent" : undefined}
        value={owner}
      />,
    );
  }
  // The task name is already the headline — only repeat it here when it differs,
  // and then carry the written-back outcome it uniquely holds.
  if (run.taskTitle && run.taskTitle !== headline) {
    metaItems.push(
      <MetaCell
        key="task"
        label={t("metaTask")}
        value={
          run.taskOutcome
            ? `${run.taskTitle} → ${t(`taskOutcome.${run.taskOutcome}`)}`
            : run.taskTitle
        }
      />,
    );
  }
  if (run.costUsd != null) {
    metaItems.push(
      <MetaCell
        emphasize
        key="cost"
        label={t("metaCost")}
        tone="ok"
        value={formatCostUsd(run.costUsd)}
      />,
    );
  }
  if (durationMs != null) {
    metaItems.push(
      <MetaCell key="duration" label={t("metaDuration")} value={formatDuration(durationMs)} />,
    );
  }
  if (approval) {
    metaItems.push(
      <MetaCell
        key="requested"
        label={tApprovals("requestedLabel")}
        value={new Date(approval.requestedAt).toLocaleString("cs")}
      />,
    );
  }
  if (approval?.via) {
    metaItems.push(<MetaCell key="via" label={tApprovals("viaLabel")} value={approval.via} />);
  }

  return (
    <>
      <Stack gap="200">
        {/* Phase 53: the assigned agent/pipeline avatar is rendered like the DS
            EntityHero — a background band (object-cover fill + gradient scrim, glyph
            fallback when absent) — with the whole run header laid over it. The Card
            keeps the state tone/HUD brackets and clips the image to the panel radius;
            EntityHero owns the image + scrim treatment. Phase 60: `imageBleed="band"`
            constrains the image to a right-anchored bounded-width strip (with a
            horizontal fade) instead of full-bleed, so the header text sits over plain
            surface — opt-in, other EntityHero consumers stay full-bleed. */}
        <Card clip corners={Boolean(tone)} tone={tone}>
          <EntityHero glyph={glyph} image={avatar} imageBleed="band">
            <Container padding="300">
              <Stack gap="200">
                <Stack wrap align="start" direction="row" gap="150" justify="between">
                  <Container minW0>
                    <Stack gap="50">
                      <Stack wrap align="start" direction="col" gap="100">
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
                      {/* id · kind · agent X (v-runs.png) — the routed agent's name folds
                      into this one meta line instead of a second, separate chip. Phase 63:
                      the agent's name is a link to its own detail page (its display name
                      may differ from `run.owner`, the id the link actually navigates to). */}
                      <Typography mono size="2xs" type="note" variant="tertiary">
                        {run.runId} · {t(`kind.${run.kind}`)}
                        {agentName && (
                          <>
                            {` · ${t("metaAgent")} `}
                            <Pressable
                              data-testid="run-agent-link"
                              onClick={() => router.push(`/agents/${run.owner}`)}
                            >
                              <Typography mono as="span" size="2xs" tone="accent" type="note">
                                {agentName}
                              </Typography>
                            </Pressable>
                          </>
                        )}
                      </Typography>
                    </Stack>
                  </Container>
                  {/* The actions/approval sit at the top-right of the header, over the
                  assigned entity's avatar band (Phase 53 — the avatar is now the
                  stretched EntityHero background behind the whole header, not a tile). */}
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
                      // Phase 61: Stop/Resume/Delete collapse behind a single kebab
                      // menu — the inline buttons this replaced are now rows in
                      // `actionItems`, built above with the same guards.
                      <MenuButton ariaLabel={t("actionsMenuLabel")} items={actionItems} />
                    )}
                  </Stack>
                </Stack>

                {/* Phase 62: the "Meta strip" from the design folder — a hairline
                separates it from the header content above (the `Divider` here rides
                the outer `Stack`'s own `gap` for the marginTop/paddingTop rhythm),
                and each stat cell is separated from the next by a thin vertical
                `Divider` (none before the first cell, none after the last — built
                from `metaItems` above so that holds even when a cell is
                conditionally absent, e.g. `AssignProjectControl` rendering null).
                The row still wraps on narrow widths — a divider can end up
                trailing at the end of a wrapped line, which reads cleanly enough;
                the alternative (pairing every divider atomically with its cell so
                it leads the next line instead) is the worse look, so this is kept
                as the flat interleave the plan calls out as preferred. */}
                <Divider />
                <Stack wrap direction="row" gap="300">
                  {metaItems.flatMap((item, i) =>
                    i > 0
                      ? [<Divider key={`divider-${i}`} orientation="vertical" />, item]
                      : [item],
                  )}
                </Stack>
              </Stack>
            </Container>
          </EntityHero>
        </Card>

        <RunInputSection run={run} />
        <RunOutputPanel run={run} />
        <ClassificationTracePanel run={run} />

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
