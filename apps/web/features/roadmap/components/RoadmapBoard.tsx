"use client";

import type { RoadmapItem } from "@zibby/contracts";
import { Card, Container, Grid, Panel, Pressable, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type CSSProperties, useState } from "react";
import {
  BOARD_COLUMNS,
  type BoardColumn,
  allTasks,
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
  EpicDetail = "roadmap-board-epic-detail",
  Column = "roadmap-column",
  ColumnBody = "roadmap-column-body",
  ColumnEmpty = "roadmap-column-empty",
}

export interface RoadmapBoardProps {
  /**
   * The selected epic to filter the board to. `undefined` (126c) means "no
   * epic selected" — the board falls back to {@link allTasks}, every
   * task-level item in the project, bucketed into the same three columns.
   */
  epic?: RoadmapItem;
  /**
   * The whole project's items — the board renders either `epic`'s own
   * children or, when `epic` is undefined, every task in the project. Either
   * way, dependency resolution (`readiness`/`blockersOf`/`dependentsOf`) spans
   * the whole project since an edge can in principle cross epics.
   */
  items: RoadmapItem[];
  /** Open the detail dialog for an item (a card, or a dependency badge on one). */
  onSelectItem: (itemId: string) => void;
  /**
   * Open the detail dialog for the EPIC itself. The board header's name is the
   * one affordance for it: a row in the epic list already means "show me this
   * epic's tasks", and overloading that click would cost the board its
   * selection gesture.
   */
  onSelectEpic: () => void;
}

const COLUMN_MAX_HEIGHT = "28rem";

/** The header dot's colour in all-tasks mode (no epic to hash) — the same
 * neutral fallback `ArchiveRow` uses for a subsystem-less row. */
const NEUTRAL_DOT_HUE = "var(--color-foreground-faint)";

/** Small solid hue dot — mirrors `SubsystemDrawer`'s `stateDotStyle` precedent
 * (a `Container` + computed inline style is the sanctioned passthrough for a
 * genuinely dynamic colour with no DS prop for it; see CLAUDE.md). */
function hueDotStyle(hue: string): CSSProperties {
  return { width: 6, height: 6, borderRadius: "50%", background: hue };
}

/**
 * The right-hand side of the roadmap tab (125d): the selected epic's 3-column
 * task board — `TO DO | IN PROGRESS | DONE`, the design mock's own columns.
 * `archived` items are filtered off entirely (D-004) and blocked ones live at
 * the bottom of TO DO behind their badge (see `BOARD_COLUMNS`). Hovering a card
 * highlights its blockers and dependents across every column (local state only,
 * no query).
 *
 * "Nový task" is NOT here: it sits in the panel's own header row alongside
 * "Synchronizovat", so the two buttons read as one row of board-level actions
 * rather than one floating per section. The board header line is then just the
 * dot + name, exactly as the mock has it.
 */
export function RoadmapBoard({ epic, items, onSelectItem, onSelectEpic }: RoadmapBoardProps) {
  const t = useTranslations("roadmap");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const get = buildRoadmapLookup(items);
  const children = epic ? epicChildren(items, epic.id) : allTasks(items);
  const groups = groupByColumn(children, get);

  const hovered = hoveredId ? get(hoveredId) : undefined;
  const highlightedIds = new Set<string>();
  if (hovered) {
    for (const blocker of blockersOf(hovered, get)) highlightedIds.add(blocker.id);
    for (const dependent of dependentsOf(hovered, items)) highlightedIds.add(dependent.id);
  }

  const columnLabel: Record<BoardColumn, string> = {
    ready: t("board.columns.ready"),
    "in-progress": t("board.columns.inProgress"),
    done: t("board.columns.done"),
  };

  return (
    <Stack data-testid={RoadmapBoardTestId.Root} gap="200">
      <Stack align="center" data-testid={RoadmapBoardTestId.Header} direction="row" gap="100">
        {epic ? (
          <Pressable
            aria-label={t("board.openEpicDetail")}
            data-testid={RoadmapBoardTestId.EpicDetail}
            onClick={onSelectEpic}
          >
            <Stack align="center" direction="row" gap="100">
              <Container shrink={false} style={hueDotStyle(epicHue(epic.id))} />
              <Typography mono uppercase size="xs" tracking="wider" type="label">
                {t("board.header", { name: epic.name })}
              </Typography>
            </Stack>
          </Pressable>
        ) : (
          <Stack align="center" direction="row" gap="100">
            <Container shrink={false} style={hueDotStyle(NEUTRAL_DOT_HUE)} />
            <Typography mono uppercase size="xs" tracking="wider" type="label">
              {t("board.allTasks")}
            </Typography>
          </Stack>
        )}
      </Stack>

      <Grid cols={3} gap="150">
        {BOARD_COLUMNS.map((column) => {
          const columnItems = groups[column];
          return (
            <Panel
              data-testid={RoadmapBoardTestId.Column}
              /* Label and count sit together on the left, as in the mock — the
                 count is a property OF the label ("TO DO 12"), and pushing it to
                 the far edge (`headerEnd`) read as an unrelated second field. */
              header={
                <Stack align="baseline" direction="row" gap="100">
                  <Typography mono uppercase size="xs" tracking="wider" type="label">
                    {columnLabel[column]}
                  </Typography>
                  <Typography mono size="xs" type="note" variant="tertiary">
                    {columnItems.length}
                  </Typography>
                </Stack>
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
                        // Only all-tasks mode needs the attribution line (D2) —
                        // every card is already the selected epic's own child
                        // in filtered mode, so the line would be redundant.
                        epic={epic ? undefined : get(item.parentId ?? "")}
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
