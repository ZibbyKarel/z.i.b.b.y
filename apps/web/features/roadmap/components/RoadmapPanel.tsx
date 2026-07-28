"use client";

import type { RoadmapItemLevel } from "@zibby/contracts";
import { Grid, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "../../../components/EmptyState/EmptyState";
import { QueryError } from "../../../components/LoadError/QueryError";
import { QueryLoading } from "../../../components/LoadingState/QueryLoading";
import { useRoadmapItemsQuery } from "../queries";
import { RoadmapBoard } from "./RoadmapBoard";
import { RoadmapEpicList } from "./RoadmapEpicList";
import { RoadmapItemDialog } from "./RoadmapItemDialog";
import { RoadmapItemFormDialog } from "./RoadmapItemFormDialog";

export enum RoadmapPanelTestId {
  Root = "roadmap-panel",
  Empty = "roadmap-panel-empty",
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
      <Stack data-testid={RoadmapPanelTestId.Empty}>
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
    <Stack data-testid={RoadmapPanelTestId.Root}>
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
