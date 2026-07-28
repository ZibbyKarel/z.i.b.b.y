"use client";

import type { RoadmapItem } from "@zibby/contracts";
import { Button, Card, Container, Grid, Panel, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type CSSProperties, useState } from "react";
import {
  BOARD_COLUMNS,
  type BoardColumn,
  blockersOf,
  buildRoadmapLookup,
  dependentsOf,
  epicChildren,
  epicHue,
  groupByColumn,
} from "../roadmap-board";
import { RoadmapCard } from "./RoadmapCard";

export enum RoadmapBoardTestId {
  Root = "roadmap-board",
  Header = "roadmap-board-header",
  Column = "roadmap-column",
  ColumnBody = "roadmap-column-body",
  ColumnEmpty = "roadmap-column-empty",
  CreateTask = "roadmap-board-create-task",
}

export interface RoadmapBoardProps {
  epic: RoadmapItem;
  /**
   * The whole project's items — the board only ever renders `epic`'s own
   * children, but dependency resolution (`readiness`/`blockersOf`/
   * `dependentsOf`) spans the whole project since an edge can in principle
   * cross epics.
   */
  items: RoadmapItem[];
  /** Open the detail dialog for an item (a card, or a dependency badge on one). */
  onSelectItem: (itemId: string) => void;
  /** Opens the "Nový task" manual-create dialog (125f), scoped to this epic. */
  onCreateTask: () => void;
}

const COLUMN_MAX_HEIGHT = "28rem";

/** Small solid hue dot — mirrors `SubsystemDrawer`'s `stateDotStyle` precedent
 * (a `Container` + computed inline style is the sanctioned passthrough for a
 * genuinely dynamic colour with no DS prop for it; see CLAUDE.md). */
function hueDotStyle(hue: string): CSSProperties {
  return { width: 6, height: 6, borderRadius: "50%", background: hue };
}

/**
 * The right-hand side of the roadmap tab (125d): the selected epic's 4-column
 * task board — `BLOKOVANÉ | READY | IN PROGRESS | DONE` (DECISIONS.md D-001),
 * `archived` items filtered off entirely (D-004). Hovering a card highlights its
 * blockers and dependents across every column (local state only, no query).
 * The header's "Nový task" button (125f) opens the manual-create dialog scoped
 * to THIS epic — the parent panel owns the dialog and passes the epic's id as
 * `parentId`, so a task always lands under the epic that's currently selected.
 */
export function RoadmapBoard({ epic, items, onSelectItem, onCreateTask }: RoadmapBoardProps) {
  const t = useTranslations("roadmap");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const get = buildRoadmapLookup(items);
  const children = epicChildren(items, epic.id);
  const groups = groupByColumn(children, get);

  const hovered = hoveredId ? get(hoveredId) : undefined;
  const highlightedIds = new Set<string>();
  if (hovered) {
    for (const blocker of blockersOf(hovered, get)) highlightedIds.add(blocker.id);
    for (const dependent of dependentsOf(hovered, items)) highlightedIds.add(dependent.id);
  }

  const columnLabel: Record<BoardColumn, string> = {
    blocked: t("board.columns.blocked"),
    ready: t("board.columns.ready"),
    "in-progress": t("board.columns.inProgress"),
    done: t("board.columns.done"),
  };

  return (
    <Stack data-testid={RoadmapBoardTestId.Root} gap="200">
      <Stack
        align="center"
        data-testid={RoadmapBoardTestId.Header}
        direction="row"
        gap="100"
        justify="between"
      >
        <Stack align="center" direction="row" gap="100">
          <Container shrink={false} style={hueDotStyle(epicHue(epic.id))} />
          <Typography mono uppercase size="xs" tracking="wider" type="label">
            {t("board.header", { name: epic.name })}
          </Typography>
        </Stack>
        <Button
          data-testid={RoadmapBoardTestId.CreateTask}
          icon="plus"
          intent="ghost"
          onClick={onCreateTask}
          size="sm"
        >
          {t("create.newTask")}
        </Button>
      </Stack>

      <Grid cols={4} gap="150">
        {BOARD_COLUMNS.map((column) => {
          const columnItems = groups[column];
          return (
            <Panel
              data-testid={RoadmapBoardTestId.Column}
              header={
                <Typography mono uppercase size="xs" tracking="wider" type="label">
                  {columnLabel[column]}
                </Typography>
              }
              headerEnd={
                <Typography mono size="xs" type="note" variant="tertiary">
                  {columnItems.length}
                </Typography>
              }
              key={column}
            >
              <Container
                data-testid={RoadmapBoardTestId.ColumnBody}
                maxHeight={COLUMN_MAX_HEIGHT}
                overflowY="auto"
                padding="150"
              >
                <Stack gap="100">
                  {columnItems.length === 0 ? (
                    <Card
                      background="surface"
                      borderStyle="dashed"
                      data-testid={RoadmapBoardTestId.ColumnEmpty}
                      radius="sm"
                    >
                      <Container padding="150">
                        <Typography mono align="center" size="xs" type="note" variant="tertiary">
                          {t("board.empty")}
                        </Typography>
                      </Container>
                    </Card>
                  ) : (
                    columnItems.map((item) => (
                      <RoadmapCard
                        blockers={blockersOf(item, get)}
                        column={column}
                        dependents={dependentsOf(item, items)}
                        highlighted={highlightedIds.has(item.id)}
                        item={item}
                        key={item.id}
                        onHoverChange={(hovering) => setHoveredId(hovering ? item.id : null)}
                        onSelect={() => onSelectItem(item.id)}
                        onSelectDependency={onSelectItem}
                      />
                    ))
                  )}
                </Stack>
              </Container>
            </Panel>
          );
        })}
      </Grid>
    </Stack>
  );
}
