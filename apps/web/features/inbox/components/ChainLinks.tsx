"use client";

import { Row, TextLink, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { NavLink } from "./links";

export enum ChainLinksTestId {
  Root = "inbox-chain",
  /** Suffixed with the link key: `inbox-chain-on-12`. */
  On = "inbox-chain-on",
  /** Suffixed with the link key: `inbox-chain-by-14`. */
  By = "inbox-chain-by",
}

/** One neighbour in a chain: a PR (`#12`) today, a Jira issue (`API-7`) for todo-14. */
export interface ChainLink {
  key: string;
  label: string;
  href: string;
}

export interface ChainLinksProps {
  /** What this card sits on / waits for (a PR's base PR, an issue's blocker). */
  on: ChainLink[];
  /** What waits on this card (PRs stacked on it, issues it blocks). */
  by: ChainLink[];
}

/** A compact "↳ on #12 · #14 waits on this →" line; renders nothing when both sides are empty. */
export function ChainLinks({ on, by }: ChainLinksProps) {
  const t = useTranslations("inboxPage.chain");
  if (on.length === 0 && by.length === 0) return null;
  const links = [
    ...on.map((link) => ({
      link,
      testId: ChainLinksTestId.On,
      text: t("on", { label: link.label }),
    })),
    ...by.map((link) => ({
      link,
      testId: ChainLinksTestId.By,
      text: t("by", { label: link.label }),
    })),
  ];
  return (
    <Row wrap data-testid={ChainLinksTestId.Root} gap="150">
      {links.map(({ link, testId, text }) => (
        <TextLink
          data-testid={`${testId}-${link.key}`}
          href={link.href}
          key={`${testId}-${link.key}`}
          linkComponent={NavLink}
        >
          <Typography type="label">{text}</Typography>
        </TextLink>
      ))}
    </Row>
  );
}
