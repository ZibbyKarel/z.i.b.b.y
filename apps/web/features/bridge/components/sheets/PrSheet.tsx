"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  AnchoredSheet,
  SheetBlock,
  SheetSection,
  type SheetTone,
  StackCrumbs,
  StatCell,
  StatCellGrid,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useApprovalsQuery } from "../../../approvals";
import { PrActionButtons } from "../../../inbox/components/PrActionButtons";
import { PrReviewButton } from "../../../inbox/components/PrReviewButton";
import { prBaseLabel, prChildren } from "../../../inbox/inbox";
import { PrThreads } from "../../../inbox/components/PrThreads";
import {
  useInboxPrDiffQuery,
  useInboxPrThreadsQuery,
  useInboxPrsQuery,
} from "../../../inbox/queries";
import { diffFiles } from "../../state/diffFiles";
import {
  type PrStatusKey,
  type PrTone,
  prStack,
  prStatus,
  prStatusKey,
} from "../../state/prStatus";
import { ApprovalNeed } from "./ApprovalNeed";
import { type SheetProps, geometry } from "./sheetTypes";

// The diff renderer is heavy and client-only — same lazy load as the inbox PR detail.
const PrDiff = dynamic(
  () => import("../../../inbox/components/PrDiff/PrDiff").then((m) => m.PrDiff),
  {
    ssr: false,
  },
);

/** `prStatus` tone vocabulary → DS sheet tones. */
const TONE: Record<PrTone, SheetTone> = {
  work: "working",
  think: "thinking",
  block: "blocked",
  err: "error",
  done: "done",
  idle: "idle",
  draft: "neutral",
};

const NOTE_KEY: Record<
  PrStatusKey,
  | "checksRunning"
  | "ciFailing"
  | "conflict"
  | "changesRequested"
  | "needsApproval"
  | "reviewRequested"
  | "draft"
  | "approved"
> = {
  reviewRequested: "reviewRequested",
  draft: "draft",
  ciFailing: "ciFailing",
  mergeConflict: "conflict",
  changesRequested: "changesRequested",
  checksRunning: "checksRunning",
  approved: "approved",
  awaitingReview: "needsApproval",
};

const CI_TONE: Record<InboxPr["ci"], SheetTone> = {
  passing: "working",
  failing: "error",
  pending: "thinking",
  unknown: "idle",
};

function reviewCell(pr: InboxPr): {
  key: "approved" | "changesRequested" | "yourReview" | "draft" | "pending";
  tone: SheetTone;
} {
  if (pr.bucket === "to-review" && !pr.draft && pr.review === "none")
    return { key: "yourReview", tone: "thinking" };
  if (pr.draft) return { key: "draft", tone: "neutral" };
  if (pr.review === "approved") return { key: "approved", tone: "working" };
  if (pr.review === "changes-requested") return { key: "changesRequested", tone: "blocked" };
  return { key: "pending", tone: "idle" };
}

/**
 * PR detail: REVIEW / CHECKS / CHANGES stat cells (the header summary), STACK breadcrumb, review
 * threads and the diff with its file sidebar (`useInboxPrDiffQuery`). The title links to GitHub.
 * Header actions: the inbox's `PrActionButtons` (code review for others' PRs; address / fix CI /
 * rebase / merge only on my own, decided by the shared predicates).
 */
export function PrSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const { data } = useInboxPrsQuery();
  const { data: approvals = [] } = useApprovalsQuery();
  const [now] = useState(() => Date.now());
  const all = useMemo(() => data?.prs ?? [], [data]);
  const pr = all.find((p) => p.url === id || String(p.number) === id);
  const { data: diff } = useInboxPrDiffQuery(pr?.projectId, pr?.number);
  const files = useMemo(() => diffFiles(diff?.diff ?? ""), [diff]);
  const { data: threads } = useInboxPrThreadsQuery(pr?.projectId, pr?.number);

  if (!pr) return null;

  const status = prStatus(pr);
  const tone = TONE[status.tone];
  const key = prStatusKey(pr);
  const review = reviewCell(pr);
  const path = [...prStack(pr, all), pr, ...prChildren(pr, all)];
  const taskIds = [
    pr.codeReview?.taskId,
    pr.addressComments?.taskId,
    pr.fixCi?.taskId,
    pr.rebase?.taskId,
  ];
  const approval = approvals.find((a) => taskIds.includes(a.runId));
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const base = prBaseLabel(pr, all);
  const dash = "—";

  const ciValue = t(`bridge.sheet.pr.ci.${pr.ci}`);

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      actions={
        <>
          <PrReviewButton pr={pr} />
          <PrActionButtons baseLabel={base} pr={pr} />
        </>
      }
      chips={[
        pr.repo,
        `${pr.headRef ?? dash} → ${base}`,
        t("bridge.sheet.pr.by", {
          who: pr.bucket === "mine" ? t("bridge.sheet.pr.you") : pr.author,
        }),
      ]}
      closeLabel={t("bridge.sheet.close")}
      footerNote={t(`bridge.sheet.pr.note.${NOTE_KEY[key]}`)}
      kind={`${t("bridge.sheet.kind.pr")} · #${pr.number}`}
      onClose={onClose}
      stateLabel={status.label}
      title={pr.title}
      titleHref={pr.url}
      tone={tone}
    >
      {approval ? <ApprovalNeed approval={approval} /> : null}
      <StatCellGrid>
        <StatCell
          label={t("bridge.sheet.pr.review")}
          tone={review.tone}
          value={t(`bridge.sheet.pr.reviewValue.${review.key}`)}
        />
        <StatCell label={t("bridge.sheet.pr.checks")} tone={CI_TONE[pr.ci]} value={ciValue} />
        <StatCell
          label={t("bridge.sheet.pr.changes")}
          tone="faint"
          value={diff ? `+${added} −${removed}` : dash}
        />
      </StatCellGrid>
      {path.length > 1 ? (
        <StackCrumbs
          crumbs={path.map((p) => ({
            id: p.url,
            label: `#${p.number}`,
            tone: TONE[prStatus(p).tone],
            current: p.url === pr.url,
          }))}
          label={t("bridge.sheet.pr.stack")}
        />
      ) : null}
      {threads?.length ? (
        <SheetSection>
          <PrThreads now={now} number={pr.number} projectId={pr.projectId} />
        </SheetSection>
      ) : null}
      {diff && diff.diff ? (
        <SheetSection>
          <SheetBlock label={t("bridge.sheet.pr.diff", { base: base })}>
            <PrDiff diff={diff.diff} />
            {diff.truncated ? (
              <Typography type="note" variant="secondary">
                {t("inboxPage.prs.diff.truncated")}
              </Typography>
            ) : null}
          </SheetBlock>
        </SheetSection>
      ) : null}
    </AnchoredSheet>
  );
}
