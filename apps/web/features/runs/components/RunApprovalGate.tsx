"use client";

import {
  Button,
  CodeBlock,
  Container,
  HoldButton,
  Icon,
  Markdown,
  Panel,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { DashboardApproval } from "../../approvals/approval";
import { HIGH_RISK_TYPES, SEVERITY, gateTitleKey } from "../../approvals/approval";
import { ApprovalPreview } from "../../approvals/components/ApprovalPreview";
import { useApproveMutation, useRejectMutation } from "../../approvals";
import { useReviseMutation } from "../../approvals/mutations";
import { useWorkflowsQuery } from "../../workflows";
import { useRunArtifactQuery } from "../queries/useRunArtifactQuery";
import type { RunView } from "../run";

export interface RunApprovalGateProps {
  approval: DashboardApproval;
  /** The gated run — lets a workflow stage checkpoint show the phase's output inline. */
  run?: Pick<RunView, "kind" | "runId" | "owner" | "stageRuns">;
}

/**
 * The artifact a workflow stage checkpoint asks the operator to review: the
 * `produces` of the phase that just finished (the last recorded stage — a revise
 * re-runs it and appends it again). Null when it isn't a checkpoint or the phase
 * declares no output.
 */
function useCheckpointArtifact(
  approval: DashboardApproval,
  run: RunApprovalGateProps["run"],
): string | null {
  const isCheckpoint = run?.kind === "workflow" && gateTitleKey(approval) === "stage-approval";
  const { data: workflows } = useWorkflowsQuery();
  const phaseId = run?.stageRuns?.at(-1)?.phaseId;
  const produces = isCheckpoint
    ? workflows?.find((w) => w.id === run.owner)?.phases.find((p) => p.id === phaseId)?.produces
    : undefined;
  const { data } = useRunArtifactQuery(run?.runId ?? "", produces ?? "", Boolean(produces));
  return produces ? (data?.content ?? null) : null;
}

/**
 * The decision panel for a run paused on `awaiting-approval`: a summary of what
 * exactly happens after confirming (the action, its structured preview and its
 * consequence) with a Potvrdit / Zamítnout footer. A workflow stage checkpoint also
 * shows the finished phase's output and can go back with a note ("Odpovědět"). Run identity lives in the run
 * header above — this panel never repeats it.
 *
 * The two outcomes are the gate's, not a destructive edit: **confirm** resumes the
 * paused run; **reject** goes through the reject endpoint — it records the denial
 * (`approval-rejected`) and terminates the run *without erasing it*, so the rejected
 * run stays in the feed and remains answerable. (Deleting a run is a separate action
 * on the run header, available once it is no longer gated — never the gate's "no".)
 */
export function RunApprovalGate({ approval, run }: RunApprovalGateProps) {
  const t = useTranslations("approvals");
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const revise = useReviseMutation();
  const checkpoint = useCheckpointArtifact(approval, run);
  // A stage checkpoint can go back with a note (answers, change requests) — the
  // phase re-runs with it and parks here again.
  const revisable = gateTitleKey(approval) === "stage-approval";
  const [note, setNote] = useState<string | null>(null);
  const sev = SEVERITY[approval.risk];
  // Payment/deletion get the same deliberate hold-to-confirm guardrail the queue card
  // uses — the highest-consequence actions must not be a single click on this surface.
  const highRisk = approval.riskType !== undefined && HIGH_RISK_TYPES.has(approval.riskType);
  const confirmAction = () => approve.mutate({ params: { id: approval.id }, body: {} });

  return (
    <Panel header={t("exactAction")} padding="250" tone={sev.tone}>
      <Stack gap="200">
        <Stack gap="50">
          <Typography leading="tight" type="subtitle" weight="semibold">
            <Typography mono as="span" tone={sev.tone} type="subtitle">
              {approval.skill}
            </Typography>{" "}
            <Typography as="span" type="subtitle" variant="tertiary">
              {t("wants")}
            </Typography>{" "}
            {approval.action}
          </Typography>
          {approval.summary && (
            <Typography mono size="sm" type="note" variant="secondary">
              {approval.summary}
            </Typography>
          )}
        </Stack>

        {approval.preview ? (
          <ApprovalPreview
            labels={{
              cart: t("previewCart"),
              total: t("previewTotal"),
              targets: t("previewTargets"),
              sendTo: t("previewSendTo"),
            }}
            preview={approval.preview}
          />
        ) : (
          approval.text &&
          // A multi-line detail (N5b: a machine action's rename preview, one
          // old → new per line) keeps its line breaks; a one-liner stays prose.
          (approval.text.includes("\n") ? (
            <CodeBlock text={approval.text} />
          ) : (
            <Typography mono size="sm" type="note" variant="secondary">
              {approval.text}
            </Typography>
          ))
        )}

        {checkpoint && (
          <Stack gap="50">
            <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="tertiary">
              {t("checkpointOutput")}
            </Typography>
            <Container data-testid="checkpoint-output" maxHeight="60vh" overflow="auto">
              <Markdown escapeHtml source={checkpoint} />
            </Container>
          </Stack>
        )}

        {approval.consequence && (
          // Bespoke severity-tinted callout: background + border are derived from
          // the dynamic `sev.cssVar` (per-severity color), which no DS prop expresses.
          <div
            // eslint-disable-next-line react/forbid-dom-props
            style={{
              display: "flex",
              gap: "0.6rem",
              alignItems: "flex-start",
              padding: "0.7rem 0.8rem",
              background: `color-mix(in srgb, ${sev.cssVar} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${sev.cssVar} 33%, transparent)`,
              borderRadius: 3,
            }}
          >
            <Icon name="warn" size="md" tone={sev.tone} />
            <Stack gap="50">
              <Typography mono uppercase size="2xs" tone={sev.tone} tracking="wide" type="note">
                {t("consequenceLabel")}
              </Typography>
              <Typography leading="snug" size="sm" type="text" variant="secondary">
                {approval.consequence}
              </Typography>
            </Stack>
          </div>
        )}

        {note !== null ? (
          <Stack gap="100">
            <TextAreaField
              data-testid="checkpoint-note"
              hint={t("reviseHint")}
              label={t("reviseLabel")}
              onChange={(e) => setNote(e.target.value)}
              value={note}
            />
            <Stack direction="row" gap="100">
              <Button block intent="secondary" onClick={() => setNote(null)}>
                {t("cancelRevise")}
              </Button>
              <Button
                block
                data-testid="checkpoint-send"
                disabled={!note.trim()}
                intent="primary"
                loading={revise.isPending}
                onClick={() =>
                  revise.mutate(
                    { params: { id: approval.id }, body: { note: note.trim() } },
                    { onSuccess: () => setNote(null) },
                  )
                }
              >
                {t("confirmRevise")}
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack direction="row" gap="100">
            {highRisk ? (
              <HoldButton
                block
                armedLabel={t("holdArmed")}
                disabled={reject.isPending}
                doneLabel={t("holdDone")}
                label={t("holdToApprove")}
                onConfirm={confirmAction}
                tone={approval.riskType === "mazani" ? "bad" : "warn"}
              />
            ) : (
              <Button
                block
                disabled={reject.isPending}
                icon="check"
                intent="primary"
                loading={approve.isPending}
                onClick={confirmAction}
                tone="ok"
              >
                {t("confirm")}
              </Button>
            )}
            {revisable && (
              <Button
                block
                data-testid="checkpoint-revise"
                disabled={approve.isPending || reject.isPending}
                icon="edit"
                intent="secondary"
                onClick={() => setNote("")}
              >
                {t("revise")}
              </Button>
            )}
            <Button
              block
              disabled={approve.isPending}
              icon="x"
              intent="danger"
              loading={reject.isPending}
              onClick={() => reject.mutate({ params: { id: approval.id }, body: {} })}
            >
              {t("reject")}
            </Button>
          </Stack>
        )}

        <Stack align="center">
          <Typography mono align="center" size="2xs" type="note" variant="tertiary">
            {t("guarantee")}
          </Typography>
        </Stack>
      </Stack>
    </Panel>
  );
}
