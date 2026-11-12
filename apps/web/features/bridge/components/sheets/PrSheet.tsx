"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  AnchoredSheet,
  Button,
  Container,
  Copyable,
  CopyableText,
  Icon,
  type IconName,
  type IconTone,
  Markdown,
  MenuButton,
  MetricStrip,
  type MetricStripItem,
  Pressable,
  Row,
  SheetBlock,
  SheetSection,
  SheetText,
  type SheetTone,
  Stack,
  StackCrumbs,
  Tab,
  TabList,
  Tabs,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ConfirmDeleteDialog } from "../../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { ChatAboutButton } from "../../../chat/components/ChatAboutButton";
import { PrActionButtons, PrFixCiButton } from "../../../inbox/components/PrActionButtons";
import { PrReviewButton } from "../../../inbox/components/PrReviewButton";
import { chainKey, itemKey, linkedPrOf, prBaseLabel, prChildren } from "../../../inbox/inbox";
import { issueHref } from "../../../inbox/components/IssueRow";
import { isFixCi, isMine } from "../../../inbox/state/prActions";
import { EntityRunList, prRunTone } from "../../../runs/components/EntityRunList";
import { prChatAbout } from "../../../inbox/prChatAbout";
import { PrReviewers } from "../../../inbox/components/PrReviewers";
import { PrThreads } from "../../../inbox/components/PrThreads";
import {
  useInboxItemsQuery,
  useInboxPrDiffQuery,
  useInboxPrReviewersQuery,
  useInboxPrThreadsQuery,
  useInboxPrsQuery,
} from "../../../inbox/queries";
import {
  useCloseProjectPrMutation,
  useSetProjectPrDraftMutation,
} from "../../../projects/mutations";
import { useProjectsQuery } from "../../../projects/queries";
import { diffFiles } from "../../state/diffFiles";
import {
  type PrStatusKey,
  type PrTone,
  prStack,
  prStatus,
  prStatusKey,
} from "../../state/prStatus";
import { type SheetProps, geometry, selectionFor } from "./sheetTypes";

// The diff renderer is heavy and client-only — same lazy load as the inbox PR detail.
const PrDiff = dynamic(
  () => import("../../../inbox/components/PrDiff/PrDiff").then((m) => m.PrDiff),
  {
    ssr: false,
  },
);

export enum PrSheetTestId {
  HeadRef = "pr-sheet-head-ref",
  BaseRef = "pr-sheet-base-ref",
  DiffStat = "pr-sheet-diffstat",
  Added = "pr-sheet-added",
  Removed = "pr-sheet-removed",
  Files = "pr-sheet-files",
  Summary = "pr-sheet-summary",
  DraftToggle = "pr-sheet-draft-toggle",
  Overview = "pr-sheet-overview",
  Changes = "pr-sheet-changes",
  IssueLink = "pr-sheet-issue-link",
  DescriptionTruncated = "pr-sheet-description-truncated",
}

/** PR bodies are untrusted: only images GitHub hosts are loaded; others render as links. */
export function isGithubImage(src: string): boolean {
  try {
    const { protocol, hostname } = new URL(src);
    return (
      protocol === "https:" &&
      (hostname === "github.com" || hostname.endsWith(".githubusercontent.com"))
    );
  } catch {
    return false;
  }
}

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
  reviewedApproved: "approved",
  reviewedChangesRequested: "changesRequested",
  reviewedCommented: "needsApproval",
};

type StatIcon = { name: IconName; tone: IconTone };

const CI_ICON: Record<InboxPr["ci"], StatIcon> = {
  passing: { name: "ok", tone: "ok" },
  failing: { name: "x", tone: "bad" },
  pending: { name: "run", tone: "run" },
  unknown: { name: "dots", tone: "faint" },
};

type ReviewKey = "approved" | "changesRequested" | "yourReview" | "draft" | "pending";

const REVIEW_ICON: Record<ReviewKey, StatIcon> = {
  approved: { name: "check", tone: "ok" },
  changesRequested: { name: "edit", tone: "warn" },
  pending: { name: "clock", tone: "faint" },
  yourReview: { name: "search", tone: "accent" },
  draft: { name: "dots", tone: "faint" },
};

function reviewKey(pr: InboxPr): ReviewKey {
  if (pr.bucket === "to-review" && !pr.draft && pr.review === "none") return "yourReview";
  if (pr.draft) return "draft";
  if (pr.review === "approved") return "approved";
  if (pr.review === "changes-requested") return "changesRequested";
  return "pending";
}

/** An icon + text summary value (the icon is decorative; the text carries the meaning). */
function IconValue({ icon, text }: { icon: StatIcon; text: string }) {
  return (
    <Stack inline align="center" direction="row" gap="75">
      <Icon aria-hidden name={icon.name} size="sm" tone={icon.tone} />
      {text}
    </Stack>
  );
}

/** A branch name in the code voice with a copy button; a fork head has none (dash, no copy). */
function Branch({ name, copyLabel, testId }: { name?: string; copyLabel: string; testId: string }) {
  const t = useTranslations();
  if (!name) return <Typography type="code">—</Typography>;
  return (
    <Copyable
      copiedLabel={t("common.copied")}
      copyFailedLabel={t("common.copyFailed")}
      copyLabel={copyLabel}
      text={name}
    >
      <Typography as="span" data-testid={testId} type="code">
        {name}
      </Typography>
    </Copyable>
  );
}

function errorReason(err: unknown): string {
  return typeof err === "object" && err !== null && "body" in err
    ? String((err as { body?: { message?: string } }).body?.message ?? "")
    : "";
}

/**
 * PR detail. Header: `PULL REQUEST · #n` (copyable), the title (links to GitHub), then
 * `head → base` (each copyable) with the diffstat; actions top-right with a ⋯ menu holding
 * "Close pull request" (confirmed). Summary strip (the run detail's look): State (draft toggle on
 * my PR) | Checks (Fix CI when red) | Issue (only when linked) | Author | Project. Then runs +
 * reviewers, the stack, the conversation, and Overview (description) / Changes (diff) tabs.
 */
export function PrSheet({ id, anchor, onClose, onOpen }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const { data } = useInboxPrsQuery();
  const { data: itemsData } = useInboxItemsQuery();
  const { data: projects } = useProjectsQuery();
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<"overview" | "changes">("overview");
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setDraft = useSetProjectPrDraftMutation();
  const closePr = useCloseProjectPrMutation();
  const all = useMemo(() => data?.prs ?? [], [data]);
  const pr = all.find((p) => p.url === id || String(p.number) === id);
  const { data: diff } = useInboxPrDiffQuery(pr?.projectId, pr?.number);
  const files = useMemo(() => diffFiles(diff?.diff ?? ""), [diff]);
  const { data: threads } = useInboxPrThreadsQuery(pr?.projectId, pr?.number);
  const { data: reviewers } = useInboxPrReviewersQuery(pr?.projectId, pr?.number);
  const hasReviewers = Boolean(reviewers && (reviewers.teams.length || reviewers.users.length));

  const base = pr ? prBaseLabel(pr, all) : "";
  const about = useMemo(
    () => (pr ? prChatAbout(pr, { baseLabel: base, ...(diff && { diff }) }) : null),
    [pr, base, diff],
  );

  if (!pr || !about) return null;

  const status = prStatus(pr);
  const tone = TONE[status.tone];
  const key = prStatusKey(pr);
  const review = reviewKey(pr);
  const mine = isMine(pr);
  const path = [...prStack(pr, all), pr, ...prChildren(pr, all)];
  const issues = (itemsData?.items ?? []).filter((i) => linkedPrOf(i)?.url === pr.url);
  const project = projects?.find((p) => p.id === pr.projectId);
  const runRows = (pr.runs ?? []).map((r) => ({
    id: r.runRef ?? r.taskId,
    label: t(`runs.entity.kind.${r.kind}`),
    stateLabel: t(`runs.entity.state.${r.state}`),
    tone: prRunTone(r.state),
    startedAt: r.startedAt,
    ...(r.finishedAt && { finishedAt: r.finishedAt }),
    ...(r.auto && { auto: r.auto }),
  }));
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  const target = { params: { id: pr.projectId, number: pr.number } };

  const toggleDraft = () =>
    setDraft.mutate(
      { ...target, body: { draft: !pr.draft } },
      {
        onSuccess: () => setError(null),
        onError: (err) => {
          const reason = errorReason(err);
          setError(
            reason
              ? t("bridge.sheet.pr.draftFailed", { reason })
              : t("bridge.sheet.pr.draftFailedNoReason"),
          );
        },
      },
    );

  const summary: MetricStripItem[] = [
    {
      id: "state",
      label: t("bridge.sheet.pr.state"),
      value: (
        <IconValue icon={REVIEW_ICON[review]} text={t(`bridge.sheet.pr.reviewValue.${review}`)} />
      ),
      ...(mine && {
        action: (
          <Button
            data-testid={PrSheetTestId.DraftToggle}
            disabled={setDraft.isPending}
            intent="secondary"
            loading={setDraft.isPending}
            onClick={toggleDraft}
            size="sm"
          >
            {pr.draft ? t("bridge.sheet.pr.readyForReview") : t("bridge.sheet.pr.convertToDraft")}
          </Button>
        ),
      }),
    },
    {
      id: "checks",
      label: t("bridge.sheet.pr.checks"),
      value: <IconValue icon={CI_ICON[pr.ci]} text={t(`bridge.sheet.pr.ci.${pr.ci}`)} />,
      ...(isFixCi(pr) && { action: <PrFixCiButton pr={pr} /> }),
    },
    ...(issues.length > 0
      ? [
          {
            id: "issue",
            label: t("bridge.sheet.pr.issue"),
            value: (
              <Stack wrap direction="row" gap="100">
                {issues.map((i) => (
                  <Pressable
                    data-testid={PrSheetTestId.IssueLink}
                    key={chainKey(i)}
                    onClick={() =>
                      onOpen
                        ? onOpen(selectionFor("issue", chainKey(i)))
                        : router.push(issueHref(i) as Route)
                    }
                  >
                    <Typography as="span" type="code">
                      {`${itemKey(i)} →`}
                    </Typography>
                  </Pressable>
                ))}
              </Stack>
            ),
          },
        ]
      : []),
    {
      id: "author",
      label: t("bridge.sheet.pr.author"),
      value: pr.authorName ?? pr.author,
      ...(pr.authorName && { hint: pr.author }),
    },
    {
      id: "project",
      label: t("bridge.sheet.pr.project"),
      value: project?.name ?? pr.projectId,
      hint: pr.repo,
    },
  ];

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      actions={
        <>
          <ChatAboutButton about={about} />
          <PrReviewButton pr={pr} />
          <PrActionButtons hideFixCi baseLabel={base} pr={pr} />
          {mine ? (
            <MenuButton
              ariaLabel={t("bridge.sheet.pr.moreActions")}
              items={[
                {
                  id: "close",
                  label: t("bridge.sheet.pr.closePr"),
                  icon: "x",
                  danger: true,
                  onSelect: () => setConfirmClose(true),
                },
              ]}
            />
          ) : null}
        </>
      }
      closeLabel={t("bridge.sheet.close")}
      footerNote={error ?? t(`bridge.sheet.pr.note.${NOTE_KEY[key]}`)}
      kind={
        <>
          {`${t("bridge.sheet.kind.pr")} · `}
          <CopyableText
            copiedLabel={t("common.copied")}
            copyFailedLabel={t("common.copyFailed")}
            copyLabel={t("bridge.sheet.pr.copyNumber")}
            text={`#${pr.number}`}
          />
        </>
      }
      meta={
        <>
          <Branch
            copyLabel={t("bridge.sheet.pr.copyBranch")}
            name={pr.headRef}
            testId={PrSheetTestId.HeadRef}
          />
          <Typography as="span" type="code" variant="secondary">
            →
          </Typography>
          <Branch
            copyLabel={t("bridge.sheet.pr.copyBranch")}
            name={pr.baseRef ?? base}
            testId={PrSheetTestId.BaseRef}
          />
          {diff ? (
            <Row data-testid={PrSheetTestId.DiffStat} gap="75">
              <Typography as="span" data-testid={PrSheetTestId.Added} tone="ok" type="code">
                +{added}
              </Typography>
              <Typography as="span" data-testid={PrSheetTestId.Removed} tone="bad" type="code">
                −{removed}
              </Typography>
              <Typography
                as="span"
                data-testid={PrSheetTestId.Files}
                type="code"
                variant="secondary"
              >
                {`· ${t("bridge.sheet.pr.files", { count: files.length })}`}
              </Typography>
            </Row>
          ) : null}
        </>
      }
      onClose={onClose}
      stateLabel={status.label}
      title={pr.title}
      titleHref={pr.url}
      tone={tone}
    >
      <Container data-testid={PrSheetTestId.Summary} padding={["150", "300", "0", "300"]}>
        <MetricStrip columns={summary.length === 5 ? 5 : 4} items={summary} />
      </Container>
      {runRows.length > 0 || hasReviewers ? (
        <SheetSection>
          {/* Runs on the left, the Reviewers tree on the same row at the far right (todo-5). */}
          <Row wrap align="start" gap="300" justify={runRows.length > 0 ? "between" : "end"}>
            {runRows.length > 0 ? (
              <Container grow minW0>
                <SheetBlock label={t("runs.entity.title")}>
                  <EntityRunList
                    onOpen={(runId) =>
                      onOpen
                        ? onOpen(selectionFor("run", runId))
                        : router.push(`/activity/runs/${runId}` as Route)
                    }
                    rows={runRows}
                  />
                </SheetBlock>
              </Container>
            ) : null}
            {hasReviewers ? <PrReviewers number={pr.number} projectId={pr.projectId} /> : null}
          </Row>
        </SheetSection>
      ) : null}
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
      <SheetSection>
        <Stack gap="150">
          <Tabs onValueChange={(v) => setTab(v === "changes" ? "changes" : "overview")} value={tab}>
            <TabList>
              <Tab value="overview">{t("bridge.sheet.pr.tabOverview")}</Tab>
              <Tab value="changes">{t("bridge.sheet.pr.changes")}</Tab>
            </TabList>
          </Tabs>
          {tab === "overview" ? (
            <Container data-testid={PrSheetTestId.Overview}>
              {pr.body ? (
                <Stack gap="100">
                  <Markdown escapeHtml allowImage={isGithubImage} source={pr.body} />
                  {pr.descriptionTruncated ? (
                    <Typography type="note" variant="secondary">
                      <TextLink
                        data-testid={PrSheetTestId.DescriptionTruncated}
                        href={pr.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {t("bridge.sheet.pr.descriptionTruncated")}
                      </TextLink>
                    </Typography>
                  ) : null}
                </Stack>
              ) : (
                <SheetText lines={[t("bridge.sheet.pr.noDescription")]} />
              )}
            </Container>
          ) : (
            <Container data-testid={PrSheetTestId.Changes}>
              <SheetBlock label={t("bridge.sheet.pr.diff", { base })}>
                {diff?.diff ? (
                  <PrDiff diff={diff.diff} />
                ) : (
                  <SheetText lines={[t("bridge.sheet.none")]} />
                )}
                {diff?.truncated ? (
                  <Typography type="note" variant="secondary">
                    {t("inboxPage.prs.diff.truncated")}
                  </Typography>
                ) : null}
              </SheetBlock>
            </Container>
          )}
        </Stack>
      </SheetSection>
      {confirmClose ? (
        <ConfirmDeleteDialog
          body={t("bridge.sheet.pr.closeConfirmBody", { number: pr.number })}
          cancelLabel={t("common.cancel")}
          confirmLabel={t("bridge.sheet.pr.closePr")}
          icon="x"
          onCancel={() => setConfirmClose(false)}
          onConfirm={() =>
            closePr.mutate(
              { ...target, body: {} },
              {
                onSuccess: () => {
                  setConfirmClose(false);
                  setError(null);
                  onClose();
                },
                onError: (err) => {
                  setConfirmClose(false);
                  const reason = errorReason(err);
                  setError(
                    reason
                      ? t("bridge.sheet.pr.closeFailed", { reason })
                      : t("bridge.sheet.pr.closeFailedNoReason"),
                  );
                },
              },
            )
          }
          pending={closePr.isPending}
          title={t("bridge.sheet.pr.closeConfirmTitle", { number: pr.number })}
        />
      ) : null}
    </AnchoredSheet>
  );
}
