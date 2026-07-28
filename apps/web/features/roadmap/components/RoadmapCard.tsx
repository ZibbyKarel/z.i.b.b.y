"use client";

import type { RoadmapItem } from "@zibby/contracts";
import {
  Button,
  Card,
  Chip,
  Container,
  Icon,
  Pressable,
  Stack,
  type StateTone,
  Tooltip,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { usePlayRoadmapItemMutation } from "../mutations/usePlayRoadmapItemMutation";
import type { BoardColumn } from "../roadmap-board";
import { stripMarkdownPreview } from "../roadmap-board";

export enum RoadmapCardTestId {
  Root = "roadmap-card",
  ExternalLink = "roadmap-card-external-link",
  ExternalKey = "roadmap-card-external-key",
  Play = "roadmap-card-play",
  Open = "roadmap-card-open",
  Failed = "roadmap-card-failed",
  Blocker = "roadmap-card-blocker",
  Dependents = "roadmap-card-dependents",
}

export interface RoadmapCardProps {
  item: RoadmapItem;
  /** This item's readiness column — drives the edge tone (a `failed` item still
   * carries a distinct red edge on top of it; see {@link edgeToneFor}). */
  column: BoardColumn;
  /** Resolved `dependsOn` targets, in order (see `blockersOf`). */
  blockers: RoadmapItem[];
  /** Every project item that depends on this one (see `dependentsOf`). */
  dependents: RoadmapItem[];
  /** Hover-highlighted because it's a blocker/dependent of the currently hovered card. */
  highlighted?: boolean;
  onHoverChange: (hovering: boolean) => void;
  /** Open this card's own detail dialog. */
  onSelect: () => void;
  /** Open another item's detail dialog (a dependency badge was clicked). */
  onSelectDependency: (itemId: string) => void;
}

/** BLOKOVANÉ = warn (waiting, not an error); IN PROGRESS = run; DONE = ok; READY =
 * accent, UNLESS the item is `failed` — a failed item stays in READY (D-004) but
 * must never read as ordinary un-started work, so it gets the same red as an
 * error state regardless of column. */
function edgeToneFor(column: BoardColumn, item: RoadmapItem): StateTone {
  if (item.lifecycle === "failed") return "bad";
  switch (column) {
    case "blocked":
      return "warn";
    case "in-progress":
      return "run";
    case "done":
      return "ok";
    case "ready":
      return "accent";
  }
}

/**
 * One task card on the roadmap board (125d spec + D-002). Deliberately a plain
 * `Card` (not `as="button"`): the card hosts several INDEPENDENT click targets —
 * the external-key link, the dependency badges, and the name/description area
 * that opens the detail dialog — and nesting a whole-card `<button>` around
 * per-part `<button>`/`<a>` children would be invalid, inaccessible HTML. The
 * name/description area is its own `Pressable` instead, so "click the card"
 * still opens the dialog everywhere except the parts that do something else.
 */
export function RoadmapCard({
  item,
  column,
  blockers,
  dependents,
  highlighted = false,
  onHoverChange,
  onSelect,
  onSelectDependency,
}: RoadmapCardProps) {
  const t = useTranslations("roadmap");
  const playMutation = usePlayRoadmapItemMutation(item.projectId);

  const hasExternalLink = Boolean(item.source.externalKey && item.source.url);
  const preview = stripMarkdownPreview(item.description);

  return (
    <Card
      background="surface"
      data-testid={RoadmapCardTestId.Root}
      edge={edgeToneFor(column, item)}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      radius="default"
      selected={highlighted}
    >
      <Container padding="150">
        <Stack gap="100">
          <Stack align="center" direction="row" justify="between">
            {hasExternalLink ? (
              <a
                data-testid={RoadmapCardTestId.ExternalLink}
                href={item.source.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <Stack align="center" direction="row" gap="50">
                  <Typography mono size="xs" type="note" variant="secondary">
                    {item.source.externalKey}
                  </Typography>
                  <Icon aria-hidden name="arrow" size="xs" tone="faint" />
                </Stack>
              </a>
            ) : (
              <Typography
                mono
                data-testid={RoadmapCardTestId.ExternalKey}
                size="xs"
                type="note"
                variant="tertiary"
              >
                {item.source.externalKey ?? item.id}
              </Typography>
            )}
            <Tooltip content={t("card.playInert")}>
              <Button
                aria-label={t("card.playInert")}
                data-testid={RoadmapCardTestId.Play}
                disabled={item.lifecycle !== "todo" || playMutation.isPending}
                icon="play"
                intent="ghost"
                onClick={() =>
                  playMutation.mutate({
                    params: { projectId: item.projectId, itemId: item.id },
                    body: {},
                  })
                }
                size="sm"
              />
            </Tooltip>
          </Stack>

          <Pressable
            aria-label={t("card.openDetail", { name: item.name })}
            data-testid={RoadmapCardTestId.Open}
            onClick={onSelect}
          >
            <Stack align="stretch" gap="50">
              <Stack align="center" direction="row" gap="75" justify="between">
                <Typography truncate size="sm" type="text" weight="semibold">
                  {item.name}
                </Typography>
                {item.lifecycle === "failed" && (
                  <Chip dot data-testid={RoadmapCardTestId.Failed} tone="bad">
                    {t("card.failed")}
                  </Chip>
                )}
              </Stack>
              <Typography truncate size="xs" type="note" variant="secondary">
                {preview}
              </Typography>
            </Stack>
          </Pressable>

          {(blockers.length > 0 || dependents.length > 0) && (
            <Stack wrap align="center" direction="row" gap="75">
              {blockers.map((blocker) => (
                <Pressable
                  data-testid={RoadmapCardTestId.Blocker}
                  key={blocker.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDependency(blocker.id);
                  }}
                >
                  {/*
                   * An archived blocker gets `bad`, not `wait`: it can never reach
                   * `done`, so this is a dead end needing the Tier-3 override, not an
                   * ordinary wait. The card carries the SHORT form — the full sentence
                   * overflowed a board column and clipped mid-word — with the
                   * explanation on hover and, in full, in the detail dialog.
                   */}
                  <Chip
                    title={
                      blocker.lifecycle === "archived"
                        ? t("card.waitingOnArchivedTitle")
                        : undefined
                    }
                    tone={blocker.lifecycle === "archived" ? "bad" : "wait"}
                  >
                    <Icon aria-hidden name="pause" size="xs" />
                    {blocker.lifecycle === "archived"
                      ? t("card.waitingOnArchived", { name: blocker.name })
                      : t("card.waitingOn", { name: blocker.name })}
                  </Chip>
                </Pressable>
              ))}
              {dependents.length > 0 &&
                (dependents.length === 1 ? (
                  <Pressable
                    data-testid={RoadmapCardTestId.Dependents}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectDependency(dependents[0]!.id);
                    }}
                  >
                    <Chip tone="idle">
                      <Icon aria-hidden name="arrow" size="xs" />
                      {t("card.blocks", { count: dependents.length })}
                    </Chip>
                  </Pressable>
                ) : (
                  <Chip data-testid={RoadmapCardTestId.Dependents} tone="idle">
                    <Icon aria-hidden name="arrow" size="xs" />
                    {t("card.blocks", { count: dependents.length })}
                  </Chip>
                ))}
            </Stack>
          )}
        </Stack>
      </Container>
    </Card>
  );
}
