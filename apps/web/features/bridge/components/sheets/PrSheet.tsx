"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  AnchoredSheet,
  DetailTable,
  type DetailTableRow,
  SheetAction,
  SheetBlock,
  SheetColumns,
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
import { prBaseLabel, prChildren } from "../../../inbox/inbox";
import { useInboxPrDiffQuery, useInboxPrsQuery } from "../../../inbox/queries";
import { isMerge } from "../../../inbox/state/prActions";
import { useElapsedLabel } from "../../../inbox/useElapsedLabel";
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
 * PR detail: REVIEW / CHECKS / CHANGES stat cells, STACK breadcrumb, details, CI, files and the
 * diff (`useInboxPrDiffQuery`). Footer: `OPEN ON GITHUB`, the inbox's `PrActionButtons` (code
 * review / address comments / rebase / merge, decided by the shared predicates) and — only when
 * the PR is not `ready-to-merge` — a dimmed MERGE plus `MERGE ON GITHUB`.
 * The PR list carries no description, review comments or per-check list, so those blocks are
 * not shown; CI is the single aggregate row.
 */
export function PrSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const elapsed = useElapsedLabel();
  const { data } = useInboxPrsQuery();
  const { data: approvals = [] } = useApprovalsQuery();
  const [now] = useState(() => Date.now());
  const all = useMemo(() => data?.prs ?? [], [data]);
  const pr = all.find((p) => p.url === id || String(p.number) === id);
  const { data: diff, isPending: diffPending } = useInboxPrDiffQuery(pr?.projectId, pr?.number);
  const files = useMemo(() => diffFiles(diff?.diff ?? ""), [diff]);

  if (!pr) return null;

  const status = prStatus(pr);
  const tone = TONE[status.tone];
  const key = prStatusKey(pr);
  const review = reviewCell(pr);
  const path = [...prStack(pr, all), pr, ...prChildren(pr, all)];
  const taskIds = [pr.codeReview?.taskId, pr.addressComments?.taskId, pr.rebase?.taskId];
  const approval = approvals.find((a) => taskIds.includes(a.runId));
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const base = prBaseLabel(pr, all);
  const merge = isMerge(pr);
  const dash = "—";

  const detailRows: DetailTableRow[] = [
    { cells: [t("bridge.sheet.pr.branch"), `${pr.headRef ?? dash} → ${base}`] },
    { cells: [t("bridge.sheet.pr.author"), pr.author] },
    { cells: [t("bridge.sheet.pr.opened"), elapsed(pr.createdAt, now)] },
    ...(pr.updatedAt
      ? [{ cells: [t("bridge.sheet.pr.updated"), elapsed(pr.updatedAt, now)] }]
      : []),
    {
      cells: [
        t("bridge.sheet.pr.mergeable"),
        pr.mergeable === null
          ? t("bridge.sheet.pr.unknown")
          : pr.mergeable
            ? t("bridge.sheet.pr.yes")
            : t("bridge.sheet.pr.no"),
      ],
    },
    ...(pr.unresolvedThreads === undefined
      ? []
      : [{ cells: [t("bridge.sheet.pr.threads"), String(pr.unresolvedThreads)] }]),
  ];
  const ciValue = t(`bridge.sheet.pr.ci.${pr.ci}`);
  const fileRows: DetailTableRow[] = files.map((f) => ({
    cells: [f.path, `+${f.added} −${f.removed}`],
  }));

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      chips={[
        pr.repo.toUpperCase(),
        `${(pr.headRef ?? dash).toUpperCase()} → ${base.toUpperCase()}`,
        t("bridge.sheet.pr.by", {
          who: (pr.bucket === "mine" ? t("bridge.sheet.pr.you") : pr.author).toUpperCase(),
        }),
      ]}
      closeLabel={t("bridge.sheet.close")}
      footerEnd={
        <>
          <PrActionButtons baseLabel={base} pr={pr} />
          {merge ? null : (
            <>
              <SheetAction disabled intent="primary" title={t("bridge.sheet.pr.mergeBlocked")}>
                {t("bridge.sheet.pr.merge")}
              </SheetAction>
              <SheetAction href={pr.url} intent="primary">
                {t("bridge.sheet.pr.mergeOnGithub")}
              </SheetAction>
            </>
          )}
        </>
      }
      footerNote={t(`bridge.sheet.pr.note.${NOTE_KEY[key]}`)}
      footerStart={<SheetAction href={pr.url}>{t("bridge.sheet.pr.openGithub")}</SheetAction>}
      hint={t("bridge.sheet.hint")}
      kind={`${t("bridge.sheet.kind.pr")} · #${pr.number}`}
      onClose={onClose}
      stateLabel={status.label}
      title={pr.title}
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
      <SheetColumns>
        <div>
          <SheetBlock label={t("bridge.sheet.details")}>
            <DetailTable rows={detailRows} />
          </SheetBlock>
        </div>
        <div>
          <SheetBlock label={t("bridge.sheet.pr.checks")}>
            <DetailTable
              rows={[{ cells: [t("bridge.sheet.pr.ciRow"), ciValue], tone: CI_TONE[pr.ci] }]}
              variant="check"
            />
          </SheetBlock>
          <SheetBlock
            label={t("bridge.sheet.pr.files", { n: String(files.length).padStart(2, "0") })}
          >
            <DetailTable
              emptyText={
                diffPending ? t("bridge.sheet.pr.diffLoading") : t("bridge.sheet.pr.noFiles")
              }
              rows={fileRows}
              variant="file"
            />
          </SheetBlock>
        </div>
      </SheetColumns>
      {diff && diff.diff ? (
        <SheetSection>
          <SheetBlock label={t("bridge.sheet.pr.diff", { base: base.toUpperCase() })}>
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
