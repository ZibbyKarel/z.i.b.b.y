"use client";

import {
  Button,
  ChainRouteStrip,
  type ChainRouteStripStep,
  Container,
  DiffView,
  type DiffHunk as DsDiffHunk,
  Markdown,
  MetricStrip,
  Row,
  SegmentedControl,
  Sheet,
  Stack,
  Tag,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { type PrReviewEvent, PrReviewEventSchema } from "@zibby/contracts";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useTaskRunQuery } from "../../runs/queries/useTaskRunQuery";
import { useCheckpointArtifact } from "../../runs/useCheckpointArtifact";
import { useTaskQuery } from "../../tasks/queries";
import {
  HIGH_RISK_TYPES,
  approvalOrigin,
  formatWaited,
  gateTitleKey,
  sourceLinkKind,
} from "../approval";
import { ApprovalPreview } from "./ApprovalPreview";
import { useApproveMutation, useRejectMutation, useReviseMutation } from "../mutations";
import { useApprovalQuery } from "../queries";

/** Maps this feature's `DiffHunk` (approval.ts) into the DS `DiffView`'s own shape. */
function toDsHunks(hunks: { h: string; lines: [kind: "add" | "del" | "ctx", text: string][] }[]) {
  const kindMap = { add: "add", del: "remove", ctx: "context" } as const;
  return hunks.map(
    (hunk): DsDiffHunk => ({
      header: hunk.h,
      lines: hunk.lines.map(([kind, text]) => ({ type: kindMap[kind], text })),
    }),
  );
}

/**
 * `?approval=<id>` — the shell-level approval sheet (ZB-08), mounted once in
 * `AppShell` and driven purely by the search param so the rail's "→" and any
 * other deep link can open it over any page. Single-click approve everywhere
 * (D-014/O-13 overrides the spec's HoldButton-if-high-risk) — `highRisk` is
 * shown only as a `Tag` marker. A workflow stage checkpoint also offers "request
 * changes": a required note sends the step back to re-run instead of failing the run,
 * shown next to the phase's output so questions can be answered from the sheet.
 * A PR-review sign-off (an approval carrying `suggestedReviewEvent`) adds a review-type picker above Approve (todo-10).
 */
export function ApprovalSheet({
  approvalId,
  onClose,
}: {
  approvalId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("policy.approvals.sheet");
  const tApprovals = useTranslations("approvals");
  const departments = useDepartmentLookup();
  const router = useRouter();
  const { data: approval, isPending, isError, refetch } = useApprovalQuery(approvalId);
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const revise = useReviseMutation();
  const [reason, setReason] = useState("");
  // Which note the footer is collecting: a deny reason or a change request.
  const [mode, setMode] = useState<"deny" | "revise" | null>(null);
  // todo-10: the operator's review-type pick on a PR-review sign-off, keyed by approval
  // id so switching approvals in the open sheet falls back to the new suggestion.
  const [picked, setPicked] = useState<{ id: string; event: PrReviewEvent } | null>(null);
  const reviewEvent =
    approval && picked?.id === approval.id ? picked.event : approval?.suggestedReviewEvent;

  // Best-effort parent chain: most gated runs ARE (or belong to) a task, whose
  // `subtasks` — when present — are this approval's chain route. A non-task
  // `runId` (e.g. a bare workflow run) 404s quietly and the strip is omitted.
  const taskQuery = useTaskQuery(approval?.runId ?? "");
  const task = taskQuery.data;
  const steps: ChainRouteStripStep[] =
    task?.subtasks.map((s) => ({
      code: (s.department ?? "?").toUpperCase(),
      name: s.department ? departments.name(s.department) : "",
      state: s.state,
    })) ?? [];

  const close = () => {
    setReason("");
    setMode(null);
    onClose();
  };

  // Leaving the page drops `?approval=` with it — calling `onClose` here would
  // push the old pathname back over the navigation.
  const navigate = (href: string) => {
    setReason("");
    setMode(null);
    router.push(href as Route);
  };

  const gateKey = approval ? gateTitleKey(approval) : null;
  // A stage checkpoint shows the finished phase's output (e.g. interview questions)
  // so the operator can answer right here instead of opening the run.
  const { data: gatedRun } = useTaskRunQuery(
    gateKey === "stage-approval" ? (approval?.runId ?? null) : null,
  );
  const checkpoint = useCheckpointArtifact(approval, gatedRun);
  const origin = approval ? approvalOrigin(approval, task) : null;
  const body = !approvalId ? null : isPending ? (
    <QueryLoading />
  ) : isError || !approval ? (
    <QueryError onRetry={() => void refetch()} />
  ) : (
    <Stack gap="250">
      <Stack gap="100">
        <Row gap="100">
          <Tag tone="neutral">{approval.kind}</Tag>
          {approval.riskType && HIGH_RISK_TYPES.has(approval.riskType) && (
            <Tag uppercase icon="warn" tone="blocked">
              {t("highRisk")}
            </Tag>
          )}
        </Row>
        {gateKey && <Typography type="h3">{t(`gate.${gateKey}`)}</Typography>}
        {approval.text == null && <Typography type="h3">{approval.detail}</Typography>}
        <Typography type="note" variant="tertiary">
          {approval.skill} · {t("waited", { waited: formatWaited(approval.requestedAt) })}
        </Typography>
      </Stack>

      {origin && (
        <Stack gap="50">
          <Typography tracking="wider" type="labelSm" variant="tertiary">
            {t("sourceTitle")}
          </Typography>
          <Row wrap gap="150">
            <Tag tone="neutral">{t(`origin.${origin.origin}`)}</Tag>
            {origin.url && (
              <a href={origin.url} rel="noopener noreferrer" target="_blank">
                <Typography size="sm" tone="accent" type="text">
                  {t(`sourceLink.${sourceLinkKind(origin.url)}`)} ↗
                </Typography>
              </a>
            )}
            {origin.href && (
              <Button intent="ghost" onClick={() => navigate(origin.href ?? "")} size="sm">
                {t("openInZibby")}
              </Button>
            )}
          </Row>
        </Stack>
      )}

      {/* Plain-text detail is the whole description — shown in full, line breaks kept. */}
      {approval.text != null && (
        <Container maxHeight="50vh" overflow="auto">
          <Typography leading="relaxed" style={{ whiteSpace: "pre-wrap" }} type="text">
            {approval.text}
          </Typography>
        </Container>
      )}

      <MetricStrip
        columns={3}
        items={[
          { label: t("metric.action"), value: approval.action },
          {
            label: t("metric.severity"),
            value: tApprovals(`severity.${approval.risk}`),
          },
          { label: t("metric.department"), value: approval.department ?? "—" },
        ]}
      />

      {approval.consequence && <Typography type="text">{approval.consequence}</Typography>}

      {checkpoint && (
        <Container data-testid="checkpoint-output" maxHeight="50vh" overflow="auto">
          <Markdown escapeHtml source={checkpoint} />
        </Container>
      )}

      {approval.preview?.kind === "message" && (
        <Container maxHeight="50vh" overflow="auto">
          <Markdown escapeHtml source={approval.preview.body} />
        </Container>
      )}

      {approval.preview?.kind === "diff" && (
        <DiffView
          hunks={toDsHunks(approval.preview.hunks)}
          stat={{
            files: 1,
            additions: approval.preview.hunks.flatMap((h) => h.lines).filter((l) => l[0] === "add")
              .length,
            deletions: approval.preview.hunks.flatMap((h) => h.lines).filter((l) => l[0] === "del")
              .length,
          }}
        />
      )}

      {(approval.preview?.kind === "command" || approval.preview?.kind === "cart") && (
        <ApprovalPreview
          labels={{
            cart: tApprovals("previewCart"),
            total: tApprovals("previewTotal"),
            targets: tApprovals("previewTargets"),
            sendTo: tApprovals("previewSendTo"),
          }}
          preview={approval.preview}
        />
      )}

      {steps.length > 0 && (
        <Stack gap="100">
          <Typography tracking="wider" type="labelSm" variant="tertiary">
            {t("chainTitle")}
          </Typography>
          <ChainRouteStrip size="compact" steps={steps} />
        </Stack>
      )}
    </Stack>
  );

  // The note field lives in the footer, not the scrolling body — below a long
  // checkpoint output it would open out of sight.
  const footer =
    !approval || approval.status !== "pending" ? null : mode ? (
      <Stack gap="150">
        <TextAreaField
          autoFocus
          data-testid="approval-note"
          hint={t(mode === "revise" ? "reviseHint" : "reasonHint")}
          label={t(mode === "revise" ? "reviseLabel" : "reasonLabel")}
          onChange={(e) => setReason(e.target.value)}
          value={reason}
        />
        <Row gap="100">
          <Button
            block
            intent="secondary"
            onClick={() => {
              setMode(null);
              setReason("");
            }}
          >
            {t("cancel")}
          </Button>
          {mode === "revise" ? (
            <Button
              block
              disabled={!reason.trim()}
              intent="primary"
              loading={revise.isPending}
              onClick={() =>
                revise.mutate(
                  { params: { id: approval.id }, body: { note: reason.trim() } },
                  { onSuccess: close },
                )
              }
            >
              {t("confirmRevise")}
            </Button>
          ) : (
            <Button
              block
              intent="primary"
              loading={reject.isPending}
              onClick={() =>
                reject.mutate(
                  { params: { id: approval.id }, body: reason ? { reason } : {} },
                  { onSuccess: close },
                )
              }
            >
              {t("confirmDeny")}
            </Button>
          )}
        </Row>
      </Stack>
    ) : (
      <Stack gap="150">
        {/* todo-10: a PR-review sign-off — the server's suggestion is preselected; nothing
          but this approve posts APPROVE / REQUEST_CHANGES. */}
        {reviewEvent && (
          <Stack gap="50">
            <Typography id="review-event-label" tracking="wider" type="labelSm" variant="tertiary">
              {t("reviewEvent.label")}
            </Typography>
            <SegmentedControl
              ariaLabel={t("reviewEvent.label")}
              ariaLabelledby="review-event-label"
              items={PrReviewEventSchema.options.map((value) => ({
                value,
                label: t(`reviewEvent.${value}`),
              }))}
              onChange={(value) =>
                setPicked({ id: approval.id, event: PrReviewEventSchema.parse(value) })
              }
              value={reviewEvent}
            />
          </Stack>
        )}
        <Row gap="100">
          <Button
            block
            intent="primary"
            loading={approve.isPending}
            onClick={() =>
              approve.mutate(
                { params: { id: approval.id }, body: reviewEvent ? { reviewEvent } : {} },
                { onSuccess: close },
              )
            }
          >
            {t(reviewEvent ? "submitReview" : "approve")}
          </Button>
          {gateKey === "stage-approval" && (
            <Button block intent="secondary" onClick={() => setMode("revise")}>
              {t("revise")}
            </Button>
          )}
          <Button block intent="secondary" onClick={() => setMode("deny")}>
            {t("deny")}
          </Button>
        </Row>
        {approve.isError && (
          <Typography data-testid="approval-approve-error" size="sm" tone="bad" type="text">
            {approve.error instanceof Error ? approve.error.message : t("approveFailed")}
          </Typography>
        )}
      </Stack>
    );

  return (
    <Sheet
      footer={footer}
      onClose={close}
      open={Boolean(approvalId)}
      title={approval ? approval.skill : t("title")}
      width="lg"
    >
      {body}
    </Sheet>
  );
}
