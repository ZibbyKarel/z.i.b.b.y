"use client";

import type { RoadmapItem } from "@zibby/contracts";
import {
  Button,
  Card,
  Chip,
  Container,
  Icon,
  MenuButton,
  type MenuButtonItem,
  Pressable,
  Stack,
  type StateTone,
  Tooltip,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { usePlayRoadmapItemMutation } from "../mutations/usePlayRoadmapItemMutation";
import { useResumeRoadmapItemMutation } from "../mutations/useResumeRoadmapItemMutation";
import { useRestartRoadmapItemMutation } from "../mutations/useRestartRoadmapItemMutation";
import type { BoardColumn } from "../roadmap-board";
import { epicHue, stripMarkdownPreview } from "../roadmap-board";

export enum RoadmapCardTestId {
  Root = "roadmap-card",
  ExternalLink = "roadmap-card-external-link",
  ExternalKey = "roadmap-card-external-key",
  Play = "roadmap-card-play",
  Open = "roadmap-card-open",
  Failed = "roadmap-card-failed",
  Epic = "roadmap-card-epic",
  Blocker = "roadmap-card-blocker",
  BlockerTooltip = "roadmap-card-blocker-tooltip",
  Dependents = "roadmap-card-dependents",
}

export interface RoadmapCardProps {
  item: RoadmapItem;
  /** This item's readiness column — drives the edge tone (a `failed` item still
   * carries a distinct red edge on top of it; see {@link edgeToneFor}). */
  column: BoardColumn;
  /**
   * This item's own epic, passed only in all-tasks mode (126c/D2) — renders the
   * epic-attribution line so two identically-named tasks from different epics
   * stay distinguishable. `undefined` in epic-filtered mode, where every card
   * already belongs to the same epic and the line would be redundant.
   */
  epic?: RoadmapItem;
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

/** IN PROGRESS = run; DONE = ok; TO DO = accent, UNLESS the item is `failed` — a
 * failed item stays in TO DO (D-004) but must never read as ordinary un-started
 * work, so it gets the same red as an error state regardless of column.
 *
 * A blocked item deliberately gets NO edge of its own: it now shares TO DO with
 * everything else there, and the operator's call was that blocking is carried by
 * the badge alone. Position in the column (blocked items sort last) is the second
 * signal; a third would only compete with `failed` for the same 2px of edge. */
function edgeToneFor(column: BoardColumn, item: RoadmapItem): StateTone {
  if (item.lifecycle === "failed") return "bad";
  switch (column) {
    case "in-progress":
      return "run";
    case "done":
      return "ok";
    case "ready":
      return "accent";
  }
}

/**
 * The epic-attribution dot (D2), matching the design mock's own task card: a
 * 5px hue dot ahead of the epic's name in mono.
 *
 * This replaces a hued `Chip`, which was a real bug, not just a style choice —
 * `Chip` is `whitespace-nowrap` with no truncation, so an epic named
 * "[Shoptet CLI Greenfield] Phase 1 — Offline mode" measured 280px inside a
 * 188px card and spilled across the column gap onto its neighbour. A dot plus a
 * truncating `Typography` cannot overflow, and is what the design specified in
 * the first place. `Chip` itself is left alone: every other caller passes a
 * short status word, which is what it is for.
 */
function hueDotStyle(hue: string): CSSProperties {
  return { width: 5, height: 5, borderRadius: "50%", background: hue };
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
  epic,
  blockers,
  dependents,
  highlighted = false,
  onHoverChange,
  onSelect,
  onSelectDependency,
}: RoadmapCardProps) {
  const t = useTranslations("roadmap");
  const playMutation = usePlayRoadmapItemMutation(item.projectId);
  const restartMutation = useRestartRoadmapItemMutation(item.projectId);
  const resumeMutation = useResumeRoadmapItemMutation(item.projectId);

  const hasExternalLink = Boolean(item.source.externalKey && item.source.url);
  const preview = stripMarkdownPreview(item.description);

  // A failed item's last run is resumable only when it actually reached a
  // dispatched task (has a `runRef`) — mirrors the gate's own 409 condition
  // (`RoadmapGateService.resume`) so we never offer an action the server
  // would reject.
  const lastRun = item.runs[item.runs.length - 1];
  const canResume = Boolean(lastRun?.runRef);
  const failedActions: MenuButtonItem[] = [
    {
      id: "restart",
      label: t("card.restart"),
      icon: "retry",
      onSelect: () =>
        restartMutation.mutate({
          params: { projectId: item.projectId, itemId: item.id },
          body: {},
        }),
    },
    ...(canResume
      ? [
          {
            id: "resume",
            label: t("card.resume"),
            icon: "play" as const,
            onSelect: () =>
              resumeMutation.mutate({
                params: { projectId: item.projectId, itemId: item.id },
                body: {},
              }),
          },
        ]
      : []),
  ];

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
            {item.lifecycle === "failed" ? (
              <MenuButton ariaLabel={t("card.actionsLabel")} items={failedActions} size="sm" />
            ) : item.lifecycle === "todo" ? (
              <Tooltip content={t("card.play")}>
                <Button
                  aria-label={t("card.play")}
                  data-testid={RoadmapCardTestId.Play}
                  disabled={playMutation.isPending}
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
            ) : (
              <Tooltip content={t("card.playInert")}>
                <Button
                  disabled
                  aria-label={t("card.playInert")}
                  data-testid={RoadmapCardTestId.Play}
                  icon="play"
                  intent="ghost"
                  size="sm"
                />
              </Tooltip>
            )}
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

          {/* Below the name, exactly as in the design mock — an attribution line
              reads as a footnote to the task, not as a heading above it. */}
          {epic && (
            <Stack align="center" data-testid={RoadmapCardTestId.Epic} direction="row" gap="75">
              <Container shrink={false} style={hueDotStyle(epicHue(epic.id))} />
              <Container grow minW0>
                <Typography mono truncate size="2xs" type="note" variant="tertiary">
                  {epic.name}
                </Typography>
              </Container>
            </Stack>
          )}

          {(blockers.length > 0 || dependents.length > 0) && (
            <Stack wrap align="center" direction="row" gap="75">
              {/*
               * One badge, not one chip per blocker (126f) — a task blocked by five
               * issues used to grow five chips and stop being scannable. Tone `bad`
               * when ANY blocker is archived (mirrors `edgeToneFor`'s own rule: an
               * archived blocker can never reach `done`, a dead end needing the
               * Tier-3 override, not an ordinary wait), else `wait`. The label spends
               * the operator's two words on count instead of picking one arbitrarily
               * (D11): singular "čeká", plural "blokován (N)". Titles are data, so the
               * tooltip is composed here from `blockers`, not a translated blob (D12).
               * Click opens THIS card's own detail dialog — per-blocker click-through
               * already lives in `RoadmapItemDialog`.
               */}
              {blockers.length > 0 && (
                <Tooltip
                  content={
                    /* `as="span"` throughout: `Tooltip` renders its bubble as a
                       `<span>`, and both `Stack` and `Typography type="label|note"`
                       default to `<div>` — a block element inside an inline one is
                       invalid HTML. React inserts via DOM APIs so nothing visibly
                       breaks today, but this is the first rich-node tooltip in the
                       repo and the next one should copy something valid. */
                    <Stack as="span" data-testid={RoadmapCardTestId.BlockerTooltip} gap="25">
                      <Typography as="span" size="xs" type="label">
                        {t("card.blockedTooltipTitle")}
                      </Typography>
                      {blockers.map((blocker) => (
                        <Typography as="span" key={blocker.id} size="xs" type="note">
                          {blocker.lifecycle === "archived"
                            ? t("card.blockedArchivedMarker", { name: blocker.name })
                            : blocker.name}
                        </Typography>
                      ))}
                    </Stack>
                  }
                >
                  <Pressable
                    data-testid={RoadmapCardTestId.Blocker}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                    }}
                  >
                    <Chip
                      tone={
                        blockers.some((blocker) => blocker.lifecycle === "archived")
                          ? "bad"
                          : "wait"
                      }
                    >
                      <Icon aria-hidden name="pause" size="xs" />
                      {blockers.length === 1
                        ? t("card.blockedOne")
                        : t("card.blockedMany", { count: blockers.length })}
                    </Chip>
                  </Pressable>
                </Tooltip>
              )}
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
