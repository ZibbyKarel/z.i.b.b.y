"use client";

import {
  AnchoredSheet,
  CopyableText,
  DetailTable,
  type DetailTableRow,
  Markdown,
  NeedsYouCard,
  Pressable,
  SheetAction,
  SheetBlock,
  SheetSection,
  SheetText,
  type SheetTone,
  Typography,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatAboutButton } from "../../../chat/components/ChatAboutButton";
import { issueChatAbout } from "../../../chat/chatAbout";
import { useInboxItemsQuery, useInboxPrsQuery } from "../../../inbox/queries";
import {
  chainKey,
  isSourceStatusShown,
  itemKey,
  latestTaskId,
  linkedPrOf,
  newTaskFromIssueHref,
  prListHref,
  zibbyStatus,
} from "../../../inbox/inbox";
import { issueHref } from "../../../inbox/components/IssueRow";
import { compactAgo } from "../../../../utils/time";
import { useTeamsQuery } from "../../../teams";
import { EntityRunList, issueRunTone } from "../../../runs/components/EntityRunList";
import { ExternalAnchor } from "../../../inbox/components/links";
import { type SheetProps, geometry, selectionFor } from "./sheetTypes";

const STATUS_TONE: Record<ReturnType<typeof zibbyStatus>, SheetTone> = {
  new: "idle",
  waiting: "blocked",
  running: "working",
  done: "done",
};

/** Issue detail: runs and details table right under the header, then the description; the Issues screen's primary action sits top-right. */
export function IssueSheet({ id, anchor, onClose, onOpen }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const { data } = useInboxItemsQuery();
  const { data: prsData } = useInboxPrsQuery();
  const { data: teams } = useTeamsQuery();
  const [now] = useState(() => Date.now());

  const item = data?.items.find((i) => chainKey(i) === id);
  if (!item) return null;

  const status = zibbyStatus(item);
  const epic = item.parentId ? data?.epics.find((e) => e.id === item.parentId) : undefined;
  const team = item.teamId ? teams?.find((x) => x.id === item.teamId)?.name : undefined;
  const pr = linkedPrOf(item);
  const taskId = latestTaskId(item);
  const source = t(`inboxPage.source.${item.source.kind}`);
  const none = t("bridge.sheet.none");
  const sourceShown = isSourceStatusShown(status);
  const stateLabel = sourceShown ? item.sourceStatus?.name : t(`inboxPage.status.${status}`);
  const updated = compactAgo(item.updatedAt, now);

  const openPr = (url: string) =>
    onOpen ? onOpen(selectionFor("pr", url)) : router.push(prListHref(url) as Route);

  const rows: DetailTableRow[] = [
    { cells: [t("bridge.sheet.issue.epic"), epic ? `${epic.key ?? ""} · ${epic.title}` : "—"] },
    { cells: [t("bridge.sheet.issue.team"), team ?? t("bridge.sheet.issue.noTeam")] },
    { cells: [t("bridge.sheet.issue.source"), `${source} · ${itemKey(item)}`] },
    {
      cells: [
        t("bridge.sheet.issue.pr"),
        pr ? (
          prsData?.prs.some((p) => p.url === pr.url) ? (
            <Pressable onClick={() => openPr(pr.url)}>
              <Typography as="span" type="code">{`#${pr.number} →`}</Typography>
            </Pressable>
          ) : (
            <ExternalAnchor href={pr.url}>{`#${pr.number}`}</ExternalAnchor>
          )
        ) : (
          none
        ),
      ],
    },
  ];
  const runRows = [...item.runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .map((r) => ({
      id: r.runRef ?? r.taskId,
      label: r.prNumber
        ? `${t("runs.entity.kind.implementation")} · #${r.prNumber}`
        : t("runs.entity.kind.implementation"),
      stateLabel: t(`runs.entity.state.${r.outcome}`),
      tone: issueRunTone(r.outcome),
      startedAt: r.startedAt,
      ...(r.finishedAt && { finishedAt: r.finishedAt }),
    }));

  const href = issueHref(item);
  const primary =
    status === "new" ? (
      <SheetAction
        intent="primary"
        onClick={() => router.push(newTaskFromIssueHref(item) as Route)}
      >
        {t("bridge.sheet.issue.process")}
      </SheetAction>
    ) : status === "waiting" ? (
      <SheetAction intent="primary" onClick={() => router.push(href as Route)}>
        {t("bridge.sheet.issue.respond")}
      </SheetAction>
    ) : status === "running" && taskId ? (
      <SheetAction intent="primary" onClick={() => router.push(`/work/tasks/${taskId}` as Route)}>
        {t("bridge.sheet.issue.viewRun")}
      </SheetAction>
    ) : null;

  return (
    <AnchoredSheet
      {...geometry(anchor)}
      actions={
        <>
          <ChatAboutButton about={issueChatAbout(item, itemKey(item))} />
          {primary}
        </>
      }
      chips={[
        item.sourceStatus ? `${source} · ${item.sourceStatus.name}` : source,
        ...(sourceShown ? [] : [`ZIBBY · ${stateLabel}`]),
        item.project.name,
        epic
          ? t("bridge.sheet.issue.epicChip", { key: epic.key ?? epic.title })
          : t("bridge.sheet.issue.noEpic"),
        t("bridge.sheet.updated", { when: updated }),
      ]}
      closeLabel={t("bridge.sheet.close")}
      kind={
        <>
          {`${t("bridge.sheet.kind.issue")} · ${source} · `}
          <CopyableText copyLabel={t("common.copyId")} text={itemKey(item)} />
        </>
      }
      onClose={onClose}
      stateLabel={stateLabel}
      title={item.name}
      titleHref={item.source.url ?? undefined}
      tone={STATUS_TONE[status]}
    >
      {status === "waiting" && item.lastFailureReason ? (
        <NeedsYouCard
          heading={t("bridge.sheet.needsYou", { kind: item.lifecycle })}
          text={item.lastFailureReason}
          wait={t("bridge.sheet.waiting", { wait: updated })}
        />
      ) : null}
      <SheetSection>
        {runRows.length > 0 ? (
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
        ) : null}
        <SheetBlock label={t("bridge.sheet.details")}>
          <DetailTable rows={rows} />
        </SheetBlock>
        <SheetBlock label={t("bridge.sheet.description")}>
          {item.description?.trim() ? (
            <Markdown escapeHtml source={item.description} />
          ) : (
            <SheetText lines={[t("bridge.sheet.issue.noDescription")]} />
          )}
        </SheetBlock>
      </SheetSection>
    </AnchoredSheet>
  );
}
