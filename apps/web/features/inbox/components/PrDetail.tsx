"use client";

import type { InboxPr } from "@zibby/contracts";
import {
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Row,
  Stack,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { parentPr, prAncestors, prBaseLabel, prChildren, prState, prWaits } from "../inbox";
import { useInboxPrDiffQuery } from "../queries";
import { useElapsedLabel } from "../useElapsedLabel";
import { PrStackPath } from "./PrStackPath";
import { ExternalAnchor, NavLink } from "./links";

export enum PrDetailTestId {
  Root = "inbox-pr-detail",
  Header = "inbox-pr-detail-header",
  Body = "inbox-pr-detail-body",
  GitHub = "inbox-pr-detail-github",
  Loading = "inbox-pr-detail-loading",
  Error = "inbox-pr-detail-error",
  Retry = "inbox-pr-detail-retry",
  Truncated = "inbox-pr-detail-truncated",
  TooLarge = "inbox-pr-detail-too-large",
  /** The header card (4px state stripe across the top). */
  Stripe = "inbox-pr-detail-stripe",
  StateChip = "inbox-pr-detail-state",
  CiChip = "inbox-pr-detail-ci",
  ReviewChip = "inbox-pr-detail-review",
  Item = "inbox-pr-detail-item",
  Stack = "inbox-pr-detail-stack",
  WaitText = "inbox-pr-detail-wait",
  DiffLabel = "inbox-pr-detail-diff-label",
}

const CI_SYMBOL = { passing: "✓", failing: "✗", pending: "…", unknown: "?" } as const;

function DiffLoading() {
  const t = useTranslations("inboxPage.prs");
  return (
    <Typography data-testid={PrDetailTestId.Loading} type="bodySm" variant="secondary">
      {t("diff.loading")}
    </Typography>
  );
}

// The diff renderer is heavy and client-only — load it on first selection.
const PrDiff = dynamic(() => import("./PrDiff/PrDiff").then((m) => m.PrDiff), {
  ssr: false,
  loading: () => <DiffLoading />,
});

export interface PrDetailProps {
  pr: InboxPr;
  /** The unfiltered PR list — the stack path and wait text span filtered-out PRs. */
  all: readonly InboxPr[];
  /** Project name for the meta line; falls back to the repo. */
  projectName?: string | undefined;
  now: number;
  /** The inbox item whose linked PR this is — "ITEM KEY →". */
  item?: { key: string; href: string } | undefined;
  /** Selects another PR (stack path steps). */
  onSelect: (url: string) => void;
}

/**
 * The selected PR: a fixed header card (4px state stripe; meta, title, GitHub link; state / CI /
 * review chips + the linked item; for a stacked PR its stack path and what it merges after)
 * above `DIFF · VS base` and the diff, which scrolls on its own at lg+.
 */
export function PrDetail({ pr, all, projectName, now, item, onSelect }: PrDetailProps) {
  const t = useTranslations("inboxPage.prs");
  const tPage = useTranslations("inboxPage");
  const state = prState(pr);
  const stateLabel = (p: InboxPr) => t(`state.${prState(p).key}`, { team: p.reviewTeam ?? "" });
  const waits = prWaits(pr, all);
  const inStack = prAncestors(pr, all).length > 0 || prChildren(pr, all).length > 0;
  const base = prBaseLabel(pr, all);
  const waitText = waits.length
    ? t("waitText.waits", {
        prs: waits
          .map((w) => `#${w.number} (${stateLabel(w).toLowerCase()})`)
          .join(t("waitText.and")),
      })
    : parentPr(pr, all)
      ? t("waitText.below")
      : t("waitText.bottom", { base: base.toUpperCase() });
  const elapsedLabel = useElapsedLabel();
  const { data, isPending, isError, refetch } = useInboxPrDiffQuery(pr.projectId, pr.number);

  let body;
  if (isPending) body = <DiffLoading />;
  else if (isError)
    body = (
      <Row gap="150">
        <Typography data-testid={PrDetailTestId.Error} type="bodySm" variant="secondary">
          {t("diff.error")}
        </Typography>
        <Button
          data-testid={PrDetailTestId.Retry}
          intent="ghost"
          onClick={() => void refetch()}
          size="sm"
        >
          {t("diff.retry")}
        </Button>
      </Row>
    );
  else if (data.truncated && data.diff === "")
    body = (
      <Typography data-testid={PrDetailTestId.TooLarge} type="bodySm" variant="secondary">
        {t("diff.tooLarge")}
      </Typography>
    );
  else
    body = (
      <Stack gap="100">
        {data.truncated && (
          <Typography data-testid={PrDetailTestId.Truncated} type="note" variant="secondary">
            {t("diff.truncated")}
          </Typography>
        )}
        <PrDiff diff={data.diff} />
      </Stack>
    );

  return (
    <Stack grow minH0 data-testid={PrDetailTestId.Root} gap="200">
      <Container data-testid={PrDetailTestId.Header} shrink={false}>
        <Card
          background="panel"
          bordered={false}
          data-testid={PrDetailTestId.Stripe}
          edge={state.tone}
          edgeSide="top"
          edgeSize="lg"
          radius="none"
        >
          <CardContent padding={["225", "300"]}>
            <Stack gap="150">
              <Row align="start" gap="200">
                <Container grow minW0>
                  <Stack gap="50">
                    <Typography type="labelSm">
                      {[
                        projectName ?? pr.repo,
                        `#${pr.number}`,
                        pr.author,
                        elapsedLabel(pr.createdAt, now),
                      ].join(" · ")}
                    </Typography>
                    <Typography wrapAnywhere type="h3">
                      {pr.title}
                    </Typography>
                  </Stack>
                </Container>
                <TextLink
                  data-testid={PrDetailTestId.GitHub}
                  href={pr.url}
                  linkComponent={ExternalAnchor}
                >
                  <Typography type="labelSm" variant="primary">
                    {t("openGithub")} ↗
                  </Typography>
                </TextLink>
              </Row>
              <Row wrap gap="75">
                <Tag uppercase data-testid={PrDetailTestId.StateChip}>
                  {stateLabel(pr)}
                </Tag>
                <Tag uppercase data-testid={PrDetailTestId.CiChip} tone="neutral">
                  {t("ci", { symbol: CI_SYMBOL[pr.ci], state: tPage(`ci.${pr.ci}`) })}
                </Tag>
                <Tag uppercase data-testid={PrDetailTestId.ReviewChip} tone="neutral">
                  {t("reviewChip", { review: tPage(`review.${pr.review}`) })}
                </Tag>
                {item && (
                  <Container grow textAlign="right">
                    <TextLink
                      data-testid={PrDetailTestId.Item}
                      href={item.href}
                      linkComponent={NavLink}
                    >
                      <Typography type="labelSm">{t("item", { key: item.key })}</Typography>
                    </TextLink>
                  </Container>
                )}
              </Row>
              {inStack && (
                <Stack data-testid={PrDetailTestId.Stack} gap="100">
                  <Divider />
                  <PrStackPath all={all} onSelect={onSelect} pr={pr} />
                  <Typography
                    data-testid={PrDetailTestId.WaitText}
                    type="bodySm"
                    variant="secondary"
                  >
                    {waitText}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Container>
      <Typography data-testid={PrDetailTestId.DiffLabel} type="labelSm">
        {t("diffVs", { base })}
      </Typography>
      {/* At lg the column has a fixed height, so this is the only thing that scrolls;
          below lg it is content-sized and the page scrolls as usual. */}
      <Container
        grow
        aria-label={t("diff.region")}
        data-testid={PrDetailTestId.Body}
        minHeight="0"
        overflowY="auto"
        role="region"
        tabIndex={0}
      >
        {body}
      </Container>
    </Stack>
  );
}
