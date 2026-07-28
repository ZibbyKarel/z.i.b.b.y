"use client";

import type { RoadmapItem } from "@zibby/contracts";
import {
  Button,
  Card,
  Chip,
  Container,
  IconTile,
  Progress,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { DotTone } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import {
  type EpicStatus,
  buildRoadmapLookup,
  epicHue,
  epicProgress,
  epicStatus,
  stripMarkdownPreview,
} from "../roadmap-board";

export enum RoadmapEpicListTestId {
  Root = "roadmap-epic-list",
  Row = "roadmap-epic-row",
  Progress = "roadmap-epic-progress",
  Unphased = "roadmap-epic-unphased",
  Status = "roadmap-epic-status",
  CreateEpic = "roadmap-epic-list-create",
}

export interface RoadmapEpicListProps {
  /** This project's epics (`level === "epic"`). */
  epics: RoadmapItem[];
  /** The whole project's items — needed to compute each epic's children/progress/status. */
  items: RoadmapItem[];
  selectedEpicId: string | undefined;
  onSelect: (epicId: string) => void;
  /** Opens the "Nový epik" manual-create dialog (125f). */
  onCreateEpic: () => void;
}

const STATUS_TONE: Record<EpicStatus, DotTone> = {
  idea: "idle",
  todo: "idle",
  active: "run",
  blocked: "bad",
  done: "ok",
};

/** Border/fill/glyph tint for the epic's hued `IconTile` — the `style` passthrough
 * carries the one value with no DS prop for it (a per-epic hash colour); see
 * CLAUDE.md's "genuinely dynamic value" carve-out. */
function hueTileStyle(hue: string): CSSProperties {
  return {
    color: hue,
    borderColor: hue,
    backgroundColor: `color-mix(in srgb, ${hue} 14%, transparent)`,
  };
}

/**
 * The left-hand ~33% rail of the roadmap tab (D-002): one row per epic — a hued
 * `IconTile` (see `epicHue` in `../roadmap-board` for why it's a hash of the
 * epic id rather than a real `subsystem`), name + truncated description, a
 * progress bar (`done/total tasků`) or the italic-mono `nerozfázováno` when the
 * epic has no children, and a status pill. Selecting a row drives the board.
 * A trailing "Nový epik" button (125f) opens the manual-create dialog — this
 * component only ever calls `onCreateEpic`; the parent panel owns the dialog.
 */
export function RoadmapEpicList({
  epics,
  items,
  selectedEpicId,
  onSelect,
  onCreateEpic,
}: RoadmapEpicListProps) {
  const t = useTranslations("roadmap");

  const statusLabel: Record<EpicStatus, string> = {
    idea: t("epic.status.idea"),
    todo: t("epic.status.todo"),
    active: t("epic.status.active"),
    blocked: t("epic.status.blocked"),
    done: t("epic.status.done"),
  };

  const get = buildRoadmapLookup(items);

  return (
    <Stack data-testid={RoadmapEpicListTestId.Root} gap="150">
      <Typography size="xs" type="note" variant="tertiary">
        {t("hint")}
      </Typography>
      {epics.map((epic) => {
        const { done, total } = epicProgress(items, epic.id);
        const status = epicStatus(items, epic.id, get);
        const hue = epicHue(epic.id);
        const selected = epic.id === selectedEpicId;
        return (
          <Card
            as="button"
            data-testid={`${RoadmapEpicListTestId.Row}-${epic.id}`}
            interactive={!selected}
            key={epic.id}
            onClick={() => onSelect(epic.id)}
            selected={selected}
          >
            <Container padding="150">
              <Stack gap="100">
                <Stack align="start" direction="row" gap="150">
                  <IconTile glyph="flow" size="md" style={hueTileStyle(hue)} tone="neutral" />
                  <Container grow minW0>
                    <Stack gap="50">
                      <Typography truncate size="md" type="text" weight="semibold">
                        {epic.name}
                      </Typography>
                      <Typography truncate size="xs" type="note" variant="secondary">
                        {stripMarkdownPreview(epic.description)}
                      </Typography>
                    </Stack>
                  </Container>
                </Stack>
                <Stack align="center" direction="row" gap="150" justify="between">
                  <Container grow minW0>
                    {total > 0 ? (
                      <Stack data-testid={RoadmapEpicListTestId.Progress} gap="50">
                        <Progress value={(done / total) * 100} />
                        <Typography mono size="2xs" type="note" variant="tertiary">
                          {t("epic.progress", { done, total })}
                        </Typography>
                      </Stack>
                    ) : (
                      <Typography
                        mono
                        data-testid={RoadmapEpicListTestId.Unphased}
                        size="2xs"
                        style={{ fontStyle: "italic" }}
                        type="note"
                        variant="tertiary"
                      >
                        {t("epic.unphased")}
                      </Typography>
                    )}
                  </Container>
                  <Chip data-testid={RoadmapEpicListTestId.Status} tone={STATUS_TONE[status]}>
                    {statusLabel[status]}
                  </Chip>
                </Stack>
              </Stack>
            </Container>
          </Card>
        );
      })}
      <Button
        block
        data-testid={RoadmapEpicListTestId.CreateEpic}
        icon="plus"
        intent="ghost"
        onClick={onCreateEpic}
      >
        {t("create.newEpic")}
      </Button>
    </Stack>
  );
}
