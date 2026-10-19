"use client";

import { Row, TextLink, Typography } from "@zibby/design-system";
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
  /** The neighbour's title, for the accessible name. */
  title?: string | undefined;
}

/** Caller-supplied copy: visible text (may carry glyphs) and the glyph-free accessible name. */
export interface ChainLinksMessages {
  on: (link: ChainLink) => string;
  by: (link: ChainLink) => string;
  onAria: (link: ChainLink) => string;
  byAria: (link: ChainLink) => string;
}

export interface ChainLinksProps {
  /** What this card sits on / waits for (a PR's base PR, an issue's blocker). */
  on: ChainLink[];
  /** What waits on this card (PRs stacked on it, issues it blocks). */
  by: ChainLink[];
  messages: ChainLinksMessages;
}

/** A compact "↳ on #12 · #14 waits on this →" line; renders nothing when both sides are empty. */
export function ChainLinks({ on, by, messages }: ChainLinksProps) {
  if (on.length === 0 && by.length === 0) return null;
  const links = [
    ...on.map((link) => ({
      link,
      testId: ChainLinksTestId.On,
      text: messages.on(link),
      aria: messages.onAria(link),
    })),
    ...by.map((link) => ({
      link,
      testId: ChainLinksTestId.By,
      text: messages.by(link),
      aria: messages.byAria(link),
    })),
  ];
  return (
    <Row wrap data-testid={ChainLinksTestId.Root} gap="150">
      {links.map(({ link, testId, text, aria }) => (
        <TextLink
          aria-label={aria}
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
