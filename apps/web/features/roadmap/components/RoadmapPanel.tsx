"use client";

import type { RoadmapItemLevel } from "@zibby/contracts";
import { DropDownButton, Grid, Stack, Toggle, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { toastBus } from "../../../components/Toaster/toastBus";
import { useSetRoadmapConfigMutation, useSyncRoadmapItemsMutation } from "../mutations";
import { useRoadmapConfigQuery, useRoadmapItemsQuery } from "../queries";
import { RoadmapBoard } from "./RoadmapBoard";
import { RoadmapEpicList } from "./RoadmapEpicList";
import { RoadmapItemDialog } from "./RoadmapItemDialog";
import { RoadmapItemFormDialog } from "./RoadmapItemFormDialog";

export enum RoadmapPanelTestId {
  Root = "roadmap-panel",
  Empty = "roadmap-panel-empty",
  Header = "roadmap-panel-header",
  AutoSyncToggle = "roadmap-panel-auto-sync",
}

/**
 * The roadmap tab header (125h, source-picker split button per the 2026-07-29
 * design): the auto-sync toggle + the manual Sync split button, both backed
 * by the 125a/125b routes (`getRoadmapConfig`/`putRoadmapConfig`/
 * `syncRoadmapItems`) — present above BOTH the empty state and the epic
 * list/board, since Sync is exactly how an empty roadmap gets its first
 * items. The primary segment syncs every configured source; the chevron menu
 * offers Jira/GitHub individually (both always shown — syncing an
 * unconfigured source is a harmless all-zero no-op, so no extra integrations
 * query is needed to decide which to list). A toast reports the sync
 * summary; the item list itself refreshes via the mutation's own query
 * invalidation.
 */
function RoadmapSyncHeader({ projectId }: { projectId: string }) {
  const t = useTranslations("roadmap");
  const configQuery = useRoadmapConfigQuery(projectId);
  const setConfig = useSetRoadmapConfigMutation(projectId);
  const syncMutation = useSyncRoadmapItemsMutation(projectId);

  const autoSync = configQuery.data?.autoSync ?? false;

  const runSync = (source?: "jira" | "github") =>
    syncMutation.mutate(
      { params: { projectId }, body: source ? { source } : {} },
      {
        onSuccess: (result) => {
          const { imported, updated, archived } = result.body;
          toastBus.emit({
            message: t("sync.toast", { imported, updated, archived }),
            severity: "ok",
          });
        },
      },
    );

  return (
    <Stack
      align="center"
      data-testid={RoadmapPanelTestId.Header}
      direction="row"
      gap="200"
      justify="end"
    >
      <Stack align="center" direction="row" gap="75">
        <Toggle
          checked={autoSync}
          data-testid={RoadmapPanelTestId.AutoSyncToggle}
          disabled={configQuery.isPending || setConfig.isPending}
          label={t("sync.autoSync")}
          onChange={(next) => setConfig.mutate({ params: { projectId }, body: { autoSync: next } })}
          size="sm"
        />
        <Typography size="xs" type="note" variant="secondary">
          {t("sync.autoSync")}
        </Typography>
      </Stack>
      <DropDownButton
        disabled={syncMutation.isPending}
        icon="retry"
        intent="ghost"
        label={t("sync.button")}
        loading={syncMutation.isPending}
        menuAriaLabel={t("sync.sourceMenuAria")}
        menuItems={[
          { id: "jira", label: t("sync.source.jira"), onSelect: () => runSync("jira") },
          { id: "github", label: t("sync.source.github"), onSelect: () => runSync("github") },
        ]}
        onClick={() => runSync()}
        size="sm"
      />
    </Stack>
  );
}

export interface RoadmapPanelProps {
  projectId: string;
}

/** The manual-create dialog's target: an epic, or a task under a given epic. */
type CreateTarget = { level: RoadmapItemLevel; parentId?: string };

/**
 * The project detail's roadmap tab: epic list on the left, the selected
 * epic's 4-column task board on the right, and the detail dialog on
 * card/badge click (125d, read-only there — play/dispatch is 125e). "Nový
 * epik" (from the epic list) and "Nový task" (from the board, scoped to the
 * selected epic) open the SAME manual-create dialog (125f) with a different
 * `level`/`parentId` — this panel is the one place that owns that dialog's
 * open state, since both entry points need to share it.
 */
export function RoadmapPanel({ projectId }: RoadmapPanelProps) {
  const t = useTranslations("roadmap");
  const itemsQuery = useRoadmapItemsQuery(projectId);
  const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>(undefined);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);

  if (itemsQuery.isError) {
    return <QueryError onRetry={() => void itemsQuery.refetch()} />;
  }
  if (itemsQuery.isPending) {
    return <QueryLoading />;
  }

  const items = itemsQuery.data ?? [];
  const epics = items.filter((item) => item.level === "epic");

  if (epics.length === 0) {
    return (
      <Stack data-testid={RoadmapPanelTestId.Empty} gap="200">
        <RoadmapSyncHeader projectId={projectId} />
        <EmptyState
          actionLabel={t("create.newEpic")}
          description={t("emptyEpicsDescription")}
          glyph="flow"
          onAction={() => setCreateTarget({ level: "epic" })}
          title={t("emptyEpicsTitle")}
        />
        {createTarget && (
          <RoadmapItemFormDialog
            level={createTarget.level}
            onClose={() => setCreateTarget(null)}
            onCreated={(itemId) => {
              setCreateTarget(null);
              setSelectedEpicId(itemId);
            }}
            projectId={projectId}
          />
        )}
      </Stack>
    );
  }

  const selectedEpic = epics.find((epic) => epic.id === selectedEpicId) ?? epics[0]!;

  return (
    <Stack data-testid={RoadmapPanelTestId.Root} gap="200">
      <RoadmapSyncHeader projectId={projectId} />
      <Grid gap="250" sidebar="left">
        <RoadmapEpicList
          epics={epics}
          items={items}
          onCreateEpic={() => setCreateTarget({ level: "epic" })}
          onSelect={setSelectedEpicId}
          selectedEpicId={selectedEpic.id}
        />
        <RoadmapBoard
          epic={selectedEpic}
          items={items}
          onCreateTask={() => setCreateTarget({ level: "task", parentId: selectedEpic.id })}
          onSelectItem={setDetailItemId}
        />
      </Grid>

      {detailItemId && (
        <RoadmapItemDialog
          itemId={detailItemId}
          items={items}
          onClose={() => setDetailItemId(null)}
          onSelectItem={setDetailItemId}
        />
      )}

      {createTarget && (
        <RoadmapItemFormDialog
          level={createTarget.level}
          onClose={() => setCreateTarget(null)}
          onCreated={(itemId) => {
            setCreateTarget(null);
            if (createTarget.level === "epic") setSelectedEpicId(itemId);
          }}
          parentId={createTarget.parentId}
          projectId={projectId}
        />
      )}
    </Stack>
  );
}
