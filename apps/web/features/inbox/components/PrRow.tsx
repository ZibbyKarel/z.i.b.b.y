"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  Card,
  CardContent,
  Container,
  Pressable,
  Row,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { prState } from "../inbox";
import { useElapsedLabel } from "../useElapsedLabel";
import { PrActions, hasPrActions } from "./PrActions";

export enum PrRowTestId {
  Root = "inbox-pr-row",
  Title = "inbox-pr-title",
  Meta = "inbox-pr-meta",
  State = "inbox-pr-state",
  On = "inbox-pr-on",
  Waits = "inbox-pr-waits",
  Actions = "inbox-pr-actions",
}

export interface PrRowProps {
  pr: InboxPr;
  now: number;
  /** Project name for the meta line; falls back to the repo. */
  projectName?: string | undefined;
  /** The selected PR (`?pr=`, else the first group's root). */
  focused?: boolean;
  onSelect: (pr: InboxPr) => void;
  /** The PR this one is stacked on (`parentPr`) — "ON #n". */
  parent?: InboxPr | undefined;
  /** Unready ancestors (`prWaits`) — "· WAITS ON #a, #b". */
  waits: InboxPr[];
  /** `prBaseLabel` — handed to the action row ("Rebase on …"). */
  baseLabel: string;
}

/**
 * One PR card: 4px state stripe, `#n` + title, PROJECT · AUTHOR · AGE, the state line
 * (one state label · ON #parent · WAITS ON …), the action row. A click selects the PR;
 * clicks in the action row (buttons, portalled menus) don't.
 */
export function PrRow({
  pr,
  now,
  projectName,
  focused,
  onSelect,
  parent,
  waits,
  baseLabel,
}: PrRowProps) {
  const t = useTranslations("inboxPage.prs");
  const elapsedLabel = useElapsedLabel();
  const state = prState(pr);
  return (
    <Card
      interactive
      data-testid={`${PrRowTestId.Root}-${pr.number}`}
      edge={state.tone}
      edgeSize="lg"
      onClick={() => onSelect(pr)}
      radius="none"
      selected={focused === true}
    >
      <CardContent padding={["150", "175"]}>
        <Stack gap="75">
          <Row align="baseline" gap="100">
            <Typography nowrap type="code">
              #{pr.number}
            </Typography>
            <Pressable
              aria-current={focused ? "true" : undefined}
              data-testid={PrRowTestId.Title}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(pr);
              }}
            >
              <Typography wrapAnywhere type="bodySm" weight="medium">
                {pr.title}
              </Typography>
            </Pressable>
          </Row>
          <Typography data-testid={PrRowTestId.Meta} type="labelSm" variant="secondary">
            {[projectName ?? pr.repo, pr.author, elapsedLabel(pr.createdAt, now)].join(" · ")}
          </Typography>
          <Row wrap gap="100">
            <Typography
              data-testid={PrRowTestId.State}
              type="labelSm"
              variant="primary"
              weight="semibold"
            >
              {t(`state.${state.key}`, { team: pr.reviewTeam ?? "" })}
            </Typography>
            {parent && (
              <Typography data-testid={PrRowTestId.On} type="labelSm">
                {t("on", { base: `#${parent.number}` })}
              </Typography>
            )}
            {waits.length > 0 && (
              <Typography data-testid={PrRowTestId.Waits} type="labelSm">
                {t("waitsOn", { prs: waits.map((w) => `#${w.number}`).join(", ") })}
              </Typography>
            )}
          </Row>
          {hasPrActions(pr) && (
            // Its own click zone — buttons / portalled menus never select the card.
            <Container
              cursor="auto"
              data-testid={PrRowTestId.Actions}
              onClick={(e) => e.stopPropagation()}
            >
              <PrActions baseLabel={baseLabel} pr={pr} />
            </Container>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
