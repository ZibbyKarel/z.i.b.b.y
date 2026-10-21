"use client";

import {
  AnchoredSheet,
  DetailTable,
  type DetailTableRow,
  NeedsYouCard,
  SheetAction,
  SheetBlock,
  SheetSection,
  SheetText,
  type SheetTone,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useInboxItemActions } from "../../../inbox/useInboxItemActions";
import { useInboxItemsQuery } from "../../../inbox/queries";
import { chainKey, itemKey, latestTaskId, linkedPrOf, zibbyStatus } from "../../../inbox/inbox";
import { issueHref } from "../../../inbox/components/IssueRow";
import { useElapsedLabel } from "../../../inbox/useElapsedLabel";
import { useTeamsQuery } from "../../../teams";
import { type SheetProps, geometry } from "./sheetTypes";

const STATUS_TONE: Record<ReturnType<typeof zibbyStatus>, SheetTone> = {
  new: "idle",
  waiting: "blocked",
  running: "working",
  done: "done",
};

/** Issue detail: description, details table, `OPEN IN <SRC>` + the Issues screen's primary action. */
export function IssueSheet({ id, anchor, onClose }: SheetProps) {
  const t = useTranslations();
  const router = useRouter();
  const elapsed = useElapsedLabel();
  const { data } = useInboxItemsQuery();
  const { data: teams } = useTeamsQuery();
  const actions = useInboxItemActions();
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
  const stateLabel = t(`inboxPage.status.${status}`).toUpperCase();
  const updated = elapsed(item.updatedAt, now).toUpperCase();

  const rows: DetailTableRow[] = [
    { cells: [t("bridge.sheet.issue.epic"), epic ? `${epic.key ?? ""} · ${epic.title}` : "—"] },
    { cells: [t("bridge.sheet.issue.team"), team ?? t("bridge.sheet.issue.noTeam")] },
    { cells: [t("bridge.sheet.issue.source"), `${source} · ${itemKey(item)}`] },
    { cells: [t("bridge.sheet.issue.pr"), pr ? `#${pr.number}` : none] },
  ];

  const href = issueHref(item);
  const primary =
    status === "new" ? (
      <SheetAction intent="primary" onClick={() => actions.process(item)}>
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
      chips={[
        item.sourceStatus ? `${source} · ${item.sourceStatus.name.toUpperCase()}` : source,
        `ZIBBY · ${stateLabel}`,
        item.project.name.toUpperCase(),
        epic
          ? t("bridge.sheet.issue.epicChip", { key: epic.key ?? epic.title })
          : t("bridge.sheet.issue.noEpic"),
        t("bridge.sheet.updated", { when: updated }),
      ]}
      closeLabel={t("bridge.sheet.close")}
      footerEnd={primary}
      footerStart={
        item.source.url ? (
          <SheetAction href={item.source.url}>
            {t("bridge.sheet.issue.openIn", { source: source.toUpperCase() })}
          </SheetAction>
        ) : null
      }
      hint={t("bridge.sheet.hint")}
      kind={`${t("bridge.sheet.kind.issue")} · ${itemKey(item)}`}
      onClose={onClose}
      stateLabel={stateLabel}
      title={item.name}
      tone={STATUS_TONE[status]}
    >
      {status === "waiting" && item.lastFailureReason ? (
        <NeedsYouCard
          heading={t("bridge.sheet.needsYou", { kind: item.lifecycle.toUpperCase() })}
          text={item.lastFailureReason}
          wait={t("bridge.sheet.waiting", { wait: updated })}
        />
      ) : null}
      <SheetSection>
        <SheetBlock label={t("bridge.sheet.description")}>
          <SheetText
            lines={(item.description || t("bridge.sheet.issue.noDescription")).split("\n")}
          />
        </SheetBlock>
        <SheetBlock label={t("bridge.sheet.details")}>
          <DetailTable rows={rows} />
        </SheetBlock>
      </SheetSection>
    </AnchoredSheet>
  );
}
