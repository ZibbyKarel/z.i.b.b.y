"use client";

import {
  AnchoredSheet,
  AnchoredSheetTestId,
  AppFrameTestId,
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
import {
  type OperatorThreadReply,
  type PrReviewEvent,
  PrReviewEventSchema,
} from "@zibby/contracts";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RunFeedBannersTestId } from "../../runs/components/RunFeedBanners";
import {
  type RectLike,
  type SheetAnchor,
  anchorChanged,
  measureSheet,
} from "../../bridge/state/measure";
import { useInboxPrThreadsQuery } from "../../inbox/queries";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useTaskRunQuery } from "../../runs/queries/useTaskRunQuery";
import { useCheckpointArtifact } from "../../runs/useCheckpointArtifact";
import { useRunArtifacts } from "../../runs/useRunArtifacts";
import { useTaskQuery } from "../../tasks/queries";
import {
  HIGH_RISK_TYPES,
  approvalOrigin,
  formatWaited,
  gateTitleKey,
  sourceLinkKind,
} from "../approval";
import {
  AddressCommentsReview,
  addressApproveReplies,
  approveRequestBody,
} from "./AddressCommentsReview";
import { ApprovalPreview } from "./ApprovalPreview";
import { isOperatorTokenError } from "../../../state/operatorToken";
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

/** `data-rk` of the rail card an approval sheet grows out of (set in `AppShell`'s NEEDS YOU rail). */
export const approvalRowKey = (id: string) => `approval:${id}`;

/**
 * Where the sheet sits: right of the approval's rail card, over the page (same geometry as the
 * Bridge's detail sheets). With no card on screen (collapsed dock, deep link) it hangs off the rail
 * itself; null when the shell isn't mounted (the caller falls back to the side `Sheet`).
 */
function useRailAnchor(id: string | null): SheetAnchor | null {
  const [anchor, setAnchor] = useState<SheetAnchor | null>(null);
  const last = useRef<SheetAnchor | null>(null);
  useLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>(`[data-testid="${AppFrameTestId.Main}"]`);
    const root = main?.offsetParent;
    if (!id || !main || !root) {
      last.current = null;
      return;
    }
    const measure = () => {
      // Opened from a run sheet's approval card: sit beside that sheet, level with the card.
      const banner = document.querySelector(`[data-testid="${RunFeedBannersTestId.Approval}"]`);
      const runSheet = banner?.closest(`[data-testid="${AnchoredSheetTestId.Root}"]`);
      const card = document.querySelector(`[data-rk="${CSS.escape(approvalRowKey(id))}"]`);
      const rail = document.querySelector(`[data-testid="${AppFrameTestId.Rail}"]`);
      let row: RectLike | undefined =
        card?.getBoundingClientRect() ?? rail?.getBoundingClientRect();
      if (banner && runSheet) {
        const b = banner.getBoundingClientRect();
        const r = runSheet.getBoundingClientRect();
        row = { left: r.left, right: r.right, top: b.top, bottom: b.bottom, height: b.height };
      }
      if (!row) return;
      const next = measureSheet(root.getBoundingClientRect(), row, main.getBoundingClientRect());
      if (!card && !banner) next.eH = 0;
      if (!anchorChanged(next, last.current)) return;
      last.current = next;
      setAnchor(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    // The run sheet's card appears once its run has loaded.
    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [id]);
  return id ? anchor : null;
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
  // The operator's edits to the address-comments reply drafts, by thread id, keyed by approval id.
  const [edited, setEdited] = useState<{
    id: string;
    byThread: Record<string, OperatorThreadReply>;
  } | null>(null);
  const [now] = useState(() => Date.now());
  const anchor = useRailAnchor(approvalId);
  // A 401 means the operator token is unset/wrong — say so instead of a bare failure.
  const decisionErrorText = (error: unknown) =>
    isOperatorTokenError(error)
      ? tApprovals("operatorTokenMissing")
      : error instanceof Error
        ? error.message
        : t("approveFailed");
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

  // pr-address-comments: a reply for every shown open thread. Drafts come from the live threads
  // joined with the report; while those load (or fail) the task's own drafts keep approve working.
  const address = approval?.kind === "pr-address-comments" ? task?.prAddressComments : undefined;
  const { data: addressThreads } = useInboxPrThreadsQuery(
    address ? task?.projectId : undefined,
    address?.number,
  );
  const addressReplies: OperatorThreadReply[] = address
    ? addressApproveReplies(
        address,
        addressThreads,
        edited && edited.id === approval?.id ? edited.byThread : {},
      )
    : [];
  const filledReplies = addressReplies.filter((r) => r.body.trim()).length;

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
  const artifacts = useRunArtifacts(gatedRun);
  const tArtifacts = useTranslations("runs.artifacts");
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

      {artifacts.length > 0 && (
        <Stack gap="50">
          <Typography tracking="wider" type="labelSm" variant="tertiary">
            {tArtifacts("title")}
          </Typography>
          <Row wrap gap="100">
            {artifacts.map((a) =>
              a.kind === "pr" ? (
                <a href={a.href} key={a.kind} rel="noopener noreferrer" target="_blank">
                  <Typography size="sm" tone="accent" type="text">
                    {tArtifacts("openPr")} ↗
                  </Typography>
                </a>
              ) : (
                <Button intent="ghost" key={a.label} onClick={a.open} size="sm">
                  {a.kind === "folder"
                    ? tArtifacts("openFolder")
                    : tArtifacts("openFile", { name: a.label })}
                </Button>
              ),
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

      {approval.kind === "pr-address-comments" && task?.prAddressComments && (
        <AddressCommentsReview
          now={now}
          onRepliesChange={(next) => {
            // Keep only the rows that changed; untouched rows keep following the baseline.
            const changed = next.filter(
              (r, i) =>
                r.body !== addressReplies[i]?.body || r.resolve !== addressReplies[i]?.resolve,
            );
            setEdited({
              id: approval.id,
              byThread: {
                ...(edited?.id === approval.id ? edited.byThread : {}),
                ...Object.fromEntries(changed.map((r) => [r.threadId, r])),
              },
            });
          }}
          replies={addressReplies}
          task={task}
        />
      )}

      {approval.kind !== "pr-address-comments" && approval.preview?.kind === "message" && (
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

  // Approve / revise / deny (+ the PR-review type picker). `compact` = the anchored sheet's header.
  const decision = (compact: boolean) =>
    approval && (
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
        <Row wrap gap="100">
          <Button
            block={!compact}
            intent="primary"
            loading={approve.isPending}
            onClick={() =>
              approve.mutate(
                {
                  params: { id: approval.id },
                  body: approveRequestBody(address ? addressReplies : undefined, reviewEvent),
                },
                { onSuccess: close },
              )
            }
            size={compact ? "sm" : undefined}
          >
            {address
              ? tApprovals(address.fixedSha ? "approvePushReplies" : "approveReplies", {
                  n: filledReplies,
                })
              : t(reviewEvent ? "submitReview" : "approve")}
          </Button>
          {gateKey === "stage-approval" && (
            <Button
              block={!compact}
              intent="secondary"
              onClick={() => setMode("revise")}
              size={compact ? "sm" : undefined}
            >
              {t("revise")}
            </Button>
          )}
          <Button
            block={!compact}
            intent="secondary"
            onClick={() => setMode("deny")}
            size={compact ? "sm" : undefined}
          >
            {t("deny")}
          </Button>
        </Row>
        {!compact && approve.isError && (
          <Typography data-testid="approval-approve-error" size="sm" tone="bad" type="text">
            {decisionErrorText(approve.error)}
          </Typography>
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
        {(reject.isError || revise.isError) && (
          <Typography data-testid="approval-deny-error" size="sm" tone="bad" type="text">
            {decisionErrorText(reject.error ?? revise.error)}
          </Typography>
        )}
      </Stack>
    ) : (
      decision(false)
    );

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (anchor && approvalId) {
    return (
      <AnchoredSheet
        actions={approval && approval.status === "pending" && !mode ? decision(true) : undefined}
        closeLabel={tApprovals("sheetClose")}
        eraserHeight={anchor.eH}
        eraserLeft={anchor.eL}
        eraserTop={anchor.eT}
        footer={
          mode ? (
            footer
          ) : approve.isError ? (
            <Typography data-testid="approval-approve-error" size="sm" tone="bad" type="text">
              {decisionErrorText(approve.error)}
            </Typography>
          ) : undefined
        }
        height={anchor.height}
        kind={approval?.kind ?? t("title")}
        left={anchor.left}
        onClose={close}
        title={approval ? approval.skill : t("title")}
        tone={approval?.status === "pending" ? "blocked" : "neutral"}
        top={anchor.top}
        width={anchor.width}
      >
        <Container padding={["150", "250"]}>{body}</Container>
      </AnchoredSheet>
    );
  }

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
