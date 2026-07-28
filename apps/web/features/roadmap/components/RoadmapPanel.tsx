"use client";

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

export enum RoadmapPanelTestId {
  Root = "roadmap-panel",
  Empty = "roadmap-panel-empty",
}

export interface RoadmapPanelProps {
  projectId: string;
}

/**
 * The project detail's roadmap tab (125d), read-only: epic list on the left,
 * the selected epic's 4-column task board on the right, and the detail dialog
 * on card/badge click. Play/dispatch is 125e — nothing here mutates an item.
 */
export function RoadmapPanel({ projectId }: RoadmapPanelProps) {
  const t = useTranslations("roadmap");
  const itemsQuery = useRoadmapItemsQuery(projectId);
  const [selectedEpicId, setSelectedEpicId] = useState<string | undefined>(undefined);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

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
          description={t("emptyEpicsDescription")}
          glyph="flow"
          title={t("emptyEpicsTitle")}
        />
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
          onSelect={setSelectedEpicId}
          selectedEpicId={selectedEpic.id}
        />
        <RoadmapBoard epic={selectedEpic} items={items} onSelectItem={setDetailItemId} />
      </Grid>

      {detailItemId && (
        <RoadmapItemDialog
          itemId={detailItemId}
          items={items}
          onClose={() => setDetailItemId(null)}
          onSelectItem={setDetailItemId}
        />
      )}
    </Stack>
  );
}
