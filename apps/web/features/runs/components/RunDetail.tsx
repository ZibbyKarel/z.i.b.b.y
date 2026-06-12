import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Accordion,
  AccordionItem,
  Button,
  Container,
  Icon,
  type IconName,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { relativeTime } from "../../../utils/time";
import { useApprovalsQuery } from "../../approvals/queries";
import { RiskBadge } from "../../approvals/components/RiskBadge";
import { SeverityMeter } from "../../approvals/components/SeverityMeter";
import { type RunView, approvalForRun, runTitle } from "../run";
import { RunApprovalGate } from "./RunApprovalGate";
import { RunParkedPanel } from "./RunParkedPanel";
import { RunPrGatePanel } from "./RunPrGatePanel";
import { RunStateBadge } from "./RunStateBadge";
import { RunLogStream } from "./RunLogStream";

export interface RunDetailProps {
  run: RunView;
  glyph: IconName;
  now: number;
  onStop: () => void;
  stopping: boolean;
  onDelete: () => void;
  deleting: boolean;
}

function MetaCell({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <Stack gap="25">
      <Typography mono size="2xs" tracking="wide" type="note" variant="tertiary">
        {label}
      </Typography>
      <Typography mono size="sm" tone={tone} type="note" weight="semibold">
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * Run detail: one header + meta strip, then the live log (or, for pipelines, a
 * link out). A run paused on the approval gate folds the approval into this same
 * header (severity + risk type + request meta — there is no second header), shows
 * the decision panel with the action summary and Potvrdit/Smazat footer, and
 * collapses the log into an accordion so the decision is what's visible.
 */
export function RunDetail({ run, glyph, now, onStop, stopping, onDelete, deleting }: RunDetailProps) {
  const t = useTranslations("runs");
  const tApprovals = useTranslations("approvals");
  const router = useRouter();
  const { data: queue = [] } = useApprovalsQuery();
  const approval = approvalForRun(queue, run);
  // Who is doing the work: an agent run's `owner` is its agent id; the approval
  // (when present) carries the nicer display name. Surfaced in the header so a
  // paused task makes plain which agent is asking.
  const agentName = run.kind === "agent" ? approval?.skill ?? run.owner : undefined;

  const tone: "accent" | "ok" | "warn" | "bad" | undefined =
    run.status === "running"
      ? "accent"
      : run.status === "awaiting-approval" || run.status === "parked"
        ? "warn"
        : run.status === "done"
          ? "ok"
          : run.status === "error"
            ? "bad"
            : undefined;
  const ago = (n: number, unit: string) => (n === 0 ? t("agoNow") : unit === "m" ? t("agoM", { n }) : t("agoH", { n }));

  // A waiting scheduled task fires in the future — its time reads "in …".
  const inMin = Math.floor((Date.parse(run.startedAt) - now) / 60000);
  const startedValue =
    run.status === "scheduled" && inMin >= 1
      ? inMin < 60
        ? t("inM", { n: inMin })
        : t("inH", { n: Math.floor(inMin / 60) })
      : relativeTime(run.startedAt, now, ago);

  const headline = runTitle(run);

  const logPanel = run.logBase ? (
    <RunLogStream
      linesLabel={(n) => t("lines", { n })}
      liveLabel={t("liveLog")}
      logLabel={t("log")}
      run={run}
    />
  ) : run.kind === "pipeline" ? (
    <Stack align="center" direction="row" gap="100" justify="between">
      <Typography mono size="sm" type="note" variant="secondary">
        {t("pipelineNote")}
      </Typography>
      <Button icon="flow" intent="ghost" onClick={() => router.push(`/pipelines/${run.owner}`)} size="sm">
        {t("openPipeline")}
      </Button>
    </Stack>
  ) : (
    <Typography mono size="sm" type="note" variant="secondary">
      {t("scheduledNote")}
    </Typography>
  );

  return (
    <Stack gap="200">
      <HudPanel padding="300" tone={tone}>
        <Stack gap="200">
          <Stack wrap align="start" direction="row" gap="150" justify="between">
            <Stack align="start" direction="row" gap="150">
              <IconTile glyph={glyph} size="lg" />
              <Container minW0>
                <Stack gap="50">
                  <Stack wrap align="center" direction="row" gap="100">
                    <Typography type="subtitle" weight="semibold">
                      {headline}
                    </Typography>
                    <RunStateBadge canonTitle={run.status} label={t(`state.${run.status}`)} size="md" status={run.status} />
                    {agentName && (
                      <Stack align="center" direction="row" gap="50" title={t("metaAgent")}>
                        <Icon name="bot" size="xs" tone="accent" />
                        <Typography mono size="xs" type="note" variant="secondary">
                          {agentName}
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                  {run.prompt && run.prompt !== headline && (
                    <Typography leading="snug" size="sm" type="text" variant="secondary">
                      {run.prompt}
                    </Typography>
                  )}
                  <Typography mono size="2xs" type="note" variant="tertiary">
                    {run.runId} · {t(`kind.${run.kind}`)} · {run.status}
                  </Typography>
                </Stack>
              </Container>
            </Stack>
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
                {run.status === "running" && (
                  <Button disabled={stopping} icon="stop" intent="danger" onClick={onStop} size="sm">
                    {t("stop")}
                  </Button>
                )}
                <Button disabled={deleting} icon="x" intent="danger" onClick={onDelete} size="sm">
                  {run.status === "scheduled" ? t("cancelTask") : t("delete")}
                </Button>
              </Stack>
            )}
          </Stack>

          <Stack wrap direction="row" gap="300">
            {run.project && <MetaCell label={t("metaProject")} tone="accent" value={run.project} />}
            <MetaCell
              label={run.status === "scheduled" ? t("metaScheduled") : t("metaStarted")}
              value={startedValue}
            />
            {run.owner && run.kind !== "agent" && <MetaCell label={t("metaTarget")} value={run.owner} />}
            <MetaCell label={t("metaKind")} value={t(`kind.${run.kind}`)} />
            {run.taskTitle && (
              <MetaCell
                label={t("metaTask")}
                value={
                  run.taskOutcome
                    ? `${run.taskTitle} → ${t(`taskOutcome.${run.taskOutcome}`)}`
                    : run.taskTitle
                }
              />
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

      {approval ? (
        <>
          {/* A pipeline run parked on the PR gate shows what's about to be published
              (the draft + diffstat) above the generic confirm/discard panel. */}
          {run.kind === "pipeline" &&
            (approval.action === "pr.open" || approval.action === "git.push") && (
              <RunPrGatePanel pipelineRunId={run.runId} />
            )}
          <RunApprovalGate approval={approval} deleting={deleting} onDelete={onDelete} />
          <Accordion>
            <AccordionItem summary={t("output")}>{logPanel}</AccordionItem>
          </Accordion>
        </>
      ) : run.status === "parked" && run.kind === "pipeline" ? (
        <>
          <RunParkedPanel run={run} />
          <Accordion>
            <AccordionItem summary={t("output")}>{logPanel}</AccordionItem>
          </Accordion>
        </>
      ) : (
        <HudPanel padding={run.logBase ? "250" : "300"} title={run.logBase ? t("output") : undefined}>
          {logPanel}
        </HudPanel>
      )}
    </Stack>
  );
}
