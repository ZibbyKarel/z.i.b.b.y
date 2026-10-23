"use client";

import {
  Container,
  RailSplit,
  Stack,
  StatusDot,
  Tab,
  TabList,
  Tabs,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useApprovalsQuery } from "../../approvals";
import { useNewTask } from "../../tasks";
import { useWorkflowsQuery } from "../../workflows";
import { useOpenTaskRunFolderMutation } from "../mutations";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import { type RunView, approvalForRun } from "../run";
import {
  MODE_TONE,
  buildLiveFeed,
  buildRunMetrics,
  buildStageRail,
  deriveRunMode,
} from "../runDetailModel";
import { useRunLogStream, useStageRunLogStream } from "../useRunLogStream";
import { useRunActions } from "../useRunActions";
import { RunComposer } from "./RunComposer";
import { RunDetailActions } from "./RunDetailActions";
import { RunDetailHeader } from "./RunDetailHeader";
import { RunApprovalBanner } from "./RunFeedBanners";
import { RunInputView } from "./RunInputView";
import { RunLiveFeed } from "./RunLiveFeed";
import { RunOutputView, useContinueTaskContext } from "./RunOutputView";
import { RunStageRail } from "./RunStageRail";

export enum RunDetailTestId {
  Root = "run-detail",
  ViewSwitch = "run-detail-view-switch",
  ViewMeta = "run-detail-view-meta",
}

export interface RunDetailProps {
  run: RunView;
  /** Hosted in a detail sheet (the Bridge): compact header, stacked rail — same content as the page. */
  embedded?: boolean;
  /** Rendered under the approval banner (the sheet's gated-phase output). */
  children?: ReactNode;
}

type View = "live" | "input" | "output";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Run detail: status row + metrics, then the stage rail beside the LIVE / INPUT / OUTPUT body and
 * the composer. Embedded (sheet): status row, metrics, approval card (with the gated phase's output inside), then the tabs panel
 * with the rail as the LIVE tab's sidebar.
 */
export function RunDetail({ run, embedded, children }: RunDetailProps) {
  const t = useTranslations("runs.detail");
  const router = useRouter();
  const [view, setView] = useState<View>("live");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [reviseOpen, setReviseOpen] = useState(false);

  const { data: queue = [] } = useApprovalsQuery();
  const approval = approvalForRun(queue, run);
  const mode = deriveRunMode(run, approval);

  const actions = useRunActions(
    (id) => router.push(`/activity/runs/${id}`),
    () => router.push("/activity/runs"),
  );
  const openFolderMutation = useOpenTaskRunFolderMutation();
  const openFolder =
    run.kind === "workflow"
      ? () => openFolderMutation.mutate({ params: { runId: run.runId }, body: {} })
      : undefined;
  const { open: openNewTask } = useNewTask();
  const continueContext = useContinueTaskContext(run);
  const continueTask = () => openNewTask(undefined, undefined, continueContext);

  const { data: workflows } = useWorkflowsQuery();
  const workflowDef =
    run.kind === "workflow" ? workflows?.find((w) => w.id === run.owner) : undefined;
  const definedPhaseIds = workflowDef?.phases.map((p) => p.id).filter((id): id is string => !!id);

  // A ticking clock is presentation, not state polling — it only runs while the run is live.
  const [now, setNow] = useState(Date.now);
  const ticking = mode === "running" || mode === "pausing";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  const rail = buildStageRail(run, mode, definedPhaseIds, now);
  const current = rail.find((r) => r.current);
  const selected = rail.find((r) => r.phaseId === selectedPhaseId) ?? current;
  const maxRetries = workflowDef?.phases.find((p) => p.id === current?.phaseId)?.loop?.maxRetries;
  const metrics = buildRunMetrics(run, rail, maxRetries, now);
  const progressPct = Number.parseInt(metrics[0]?.value ?? "0", 10) || 0;

  const workflow = run.kind === "workflow";
  const selectedLive = workflow && selected?.stateKey === "running";
  const stageStream = useStageRunLogStream(
    run.runId,
    selectedLive ? (selected?.phaseId ?? null) : null,
  );
  const { data: stageLog } = useStageRunLogQuery(
    run.runId,
    workflow && !selectedLive ? selected?.phaseId : undefined,
  );
  const agentStream = useRunLogStream(!workflow && run.logBase ? run.runId : null);
  const transcript = workflow
    ? selectedLive
      ? stageStream.text
      : (stageLog?.content ?? "")
    : agentStream.text;

  const items = buildLiveFeed({
    rail,
    selectedPhaseId: selected?.phaseId ?? null,
    transcript,
    messages: run.messages ?? [],
    terminal: mode === "done" || mode === "stopped" || mode === "error",
  });

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (view === "live" && el) el.scrollTop = el.scrollHeight;
  }, [items.length, view]);

  const agent =
    run.kind === "agent"
      ? {
          id: run.owner,
          name: approval?.skill ?? run.processor?.name ?? run.owner,
          state: MODE_TONE[mode],
        }
      : undefined;

  // The sheet's status row already carries the state, so its LIVE tab drops the meta.
  const viewMeta =
    view === "live"
      ? embedded
        ? null
        : t("view.metaLive", { state: t(`mode.${mode}`), n: pad2(items.length) })
      : view === "input"
        ? t("view.metaInput", {
            task: run.taskId ?? run.runId,
            n: pad2(run.attachments?.length ?? 0),
          })
        : null;

  const banner =
    mode === "approval" && approval ? (
      <Container padding={embedded ? ["200", "300", "0", "300"] : ["250", "300", "0", "300"]}>
        <RunApprovalBanner
          approval={approval}
          diffstat={run.diffstat}
          onToggleRevise={() => setReviseOpen((o) => !o)}
          reviseOpen={reviseOpen}
        >
          {embedded ? children : null}
        </RunApprovalBanner>
      </Container>
    ) : null;

  return (
    <Stack data-testid={RunDetailTestId.Root} gap="0">
      {!embedded && banner}
      {!embedded && children}
      <RunDetailHeader
        actions={
          <RunDetailActions
            agentId={agent?.id}
            currentStageName={current?.name}
            mode={mode}
            onContinueTask={continueTask}
            onDelete={() => actions.remove(run.runId, run.kind)}
            onOpenFolder={openFolder}
            onPause={() => actions.pause(run)}
            onResume={(opts) => actions.resume(run, opts)}
            onStop={() => actions.stop(run)}
            pending={actions.stopping || actions.pausing || actions.resuming || actions.deleting}
            run={run}
          />
        }
        afterMetrics={
          embedded ? (
            <>
              {banner}
              {!banner && children}
            </>
          ) : undefined
        }
        agent={agent}
        compact={embedded}
        metrics={metrics}
        mode={mode}
        progressPct={progressPct}
        run={run}
      />
      <RailSplit
        bodyRef={bodyRef}
        footer={
          <RunComposer
            approval={approval}
            crew={
              workflow ? rail.map((r) => ({ key: r.phaseId, name: r.name, state: r.state })) : []
            }
            mode={mode}
            onSent={() => setView("live")}
            resume={actions.resume}
            resuming={actions.resuming}
            run={run}
          />
        }
        rail={
          // In the sheet the phases are a sidebar of the LIVE tab only; the tabs stay put above it.
          embedded && view !== "live" ? undefined : (
            <RunStageRail
              onSelect={setSelectedPhaseId}
              rows={rail}
              run={run}
              selectedPhaseId={selected?.phaseId ?? null}
            />
          )
        }
        stacked={embedded}
        toolbar={
          <Stack align="center" direction="row" gap="150" justify="between">
            <Stack data-testid={RunDetailTestId.ViewSwitch}>
              <Tabs onValueChange={(v) => setView(v as View)} value={view}>
                <TabList>
                  <Tab value="live">
                    <Stack inline align="center" direction="row" gap="75">
                      <StatusDot size="75" tone={MODE_TONE[mode]} />
                      {t("view.live")}
                    </Stack>
                  </Tab>
                  <Tab value="input">{t("view.input")}</Tab>
                  <Tab value="output">
                    <Stack inline align="center" direction="row" gap="75">
                      {mode === "done" && <StatusDot size="75" tone="done" />}
                      {t("view.output")}
                    </Stack>
                  </Tab>
                </TabList>
              </Tabs>
            </Stack>
            {viewMeta && (
              <Stack inline align="center" direction="row" gap="75">
                {view === "live" && <StatusDot size="75" tone={MODE_TONE[mode]} />}
                <Typography as="span" data-testid={RunDetailTestId.ViewMeta} type="labelSm">
                  {viewMeta}
                </Typography>
              </Stack>
            )}
          </Stack>
        }
      >
        {view === "live" && (
          <RunLiveFeed approval={approval} items={items} mode={mode} rail={rail} run={run} />
        )}
        {view === "input" && <RunInputView run={run} />}
        {view === "output" && (
          <RunOutputView
            mode={mode}
            onContinueTask={continueTask}
            onOpenFolder={openFolder}
            run={run}
          />
        )}
      </RailSplit>
    </Stack>
  );
}
