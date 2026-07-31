"use client";

import type { RoadmapItemLevel } from "@zibby/contracts";
import { DropDownButton, Grid, Stack } from "@zibby/design-system";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { toastBus } from "../../../components/Toaster/toastBus";
import { useSyncRoadmapItemsMutation } from "../mutations";
import { useRoadmapItemsQuery } from "../queries";
import { RoadmapBoard } from "./RoadmapBoard";
import { RoadmapEpicList } from "./RoadmapEpicList";
import { RoadmapItemDialog } from "./RoadmapItemDialog";
import { RoadmapItemFormDialog } from "./RoadmapItemFormDialog";

export enum RoadmapPanelTestId {
  Root = "roadmap-panel",
  Empty = "roadmap-panel-empty",
  Header = "roadmap-panel-header",
}

/**
 * The roadmap tab header (125h, source-picker split button per the 2026-07-29
 * design): the manual Sync split button, backed by the 125b `syncRoadmapItems`
 * route — present above BOTH the empty state and the epic list/board, since
 * Sync is exactly how an empty roadmap gets its first items. The primary
 * segment syncs every configured source; the chevron menu offers Jira/GitHub
 * individually (both always shown — syncing an unconfigured source is a
 * harmless all-zero no-op, so no extra integrations query is needed to decide
 * which to list). A toast reports the sync summary; the item list itself
 * refreshes via the mutation's own query invalidation.
 *
 * The auto-sync/auto-play toggles used to sit here and now live in
 * `RoadmapAutomationPanel` on the Integrations tab: Sync stays because its
 * result lands on this very board, while a standing automation setting has
 * nothing to show here.
 */
function RoadmapSyncHeader({ projectId }: { projectId: string }) {
  const t = useTranslations("roadmap");
  const syncMutation = useSyncRoadmapItemsMutation(projectId);

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
  // `?item=<id>` opens that item's dialog on mount — the landing half of the
  // run -> issue link (`RunDetail`'s "issue" meta cell). Seeded as initial state
  // rather than applied in an effect so it survives the query's pending pass
  // without a flash, and so the operator's own later clicks simply win.
  const searchParams = useSearchParams();
  const [detailItemId, setDetailItemId] = useState<string | null>(() => searchParams.get("item"));
  const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>(undefined);
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

  // `selectedEpicId` is the ONLY thing that decides which board mode is
  // showing (126c) — `undefined` means "no epic selected", which the board
  // reads as all-tasks mode. A `?item=` deep link only opens the dialog; it no
  // longer forces an epic selection, so the board stays in all-tasks mode
  // (which always contains the deep-linked task) unless the operator has
  // explicitly clicked an epic row.
  const selectedEpic = epics.find((epic) => epic.id === selectedEpicId);

  return (
    <Stack data-testid={RoadmapPanelTestId.Root} gap="200">
      <RoadmapSyncHeader projectId={projectId} />
      <Grid gap="250" sidebar="left">
        <RoadmapEpicList
          epics={epics}
          items={items}
          onCreateEpic={() => setCreateTarget({ level: "epic" })}
          onSelect={(epicId) =>
            setSelectedEpicId((current) => (current === epicId ? undefined : epicId))
          }
          selectedEpicId={selectedEpicId}
        />
        <RoadmapBoard
          epic={selectedEpic}
          items={items}
          onCreateTask={() => setCreateTarget({ level: "task", parentId: selectedEpic?.id })}
          onSelectEpic={() => {
            if (selectedEpic) setDetailItemId(selectedEpic.id);
          }}
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
