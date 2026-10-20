"use client";

import type { InboxPr } from "@zibby/contracts";
import { Card, CardContent, Container, Row, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import { prAncestors, prChildren, prState } from "../inbox";

export enum PrStackPathTestId {
  Root = "inbox-pr-stack",
  Base = "inbox-pr-stack-base",
  /** Suffixed with the PR number. */
  Step = "inbox-pr-stack-step",
  /** Suffixed with the PR number. */
  Next = "inbox-pr-stack-next",
}

export interface PrStackPathProps {
  pr: InboxPr;
  /** The unfiltered PR list — stack relations span filtered-out PRs. */
  all: readonly InboxPr[];
  onSelect: (url: string) => void;
}

/**
 * `MAIN ← #a ← #b` (current marked) + `NEXT ON TOP: #c` — the selected PR's place in its
 * stack. Steps select that PR. App-local composite: the stack path is inbox-only.
 */
export function PrStackPath({ pr, all, onSelect }: PrStackPathProps) {
  const t = useTranslations("inboxPage.prs");
  const path = [...prAncestors(pr, all), pr];
  const kids = prChildren(pr, all);
  const bottomBase = path[0]?.baseRef ?? "";
  return (
    <Row wrap data-testid={PrStackPathTestId.Root} gap="75">
      <Card data-testid={PrStackPathTestId.Base} radius="none">
        <CardContent padding={["50", "100"]}>
          <Typography type="label">{bottomBase}</Typography>
        </CardContent>
      </Card>
      {path.map((p) => (
        <Fragment key={p.url}>
          <Typography aria-hidden type="label">
            ←
          </Typography>
          {/* Card-as-button is full width; the wrapper keeps it content-sized in the row. */}
          <Container>
            <Card
              interactive
              aria-current={p === pr ? "true" : undefined}
              as="button"
              data-testid={`${PrStackPathTestId.Step}-${p.number}`}
              edge={prState(p).tone}
              onClick={() => onSelect(p.url)}
              radius="none"
              selected={p === pr}
            >
              <CardContent padding={["50", "100"]}>
                <Typography type="code" variant="primary">
                  #{p.number}
                </Typography>
              </CardContent>
            </Card>
          </Container>
        </Fragment>
      ))}
      {kids.length > 0 && (
        <>
          <Typography type="label">{t("nextOnTop")}</Typography>
          {kids.map((k) => (
            <Container key={k.url}>
              <Card
                interactive
                as="button"
                borderStyle="dashed"
                data-testid={`${PrStackPathTestId.Next}-${k.number}`}
                onClick={() => onSelect(k.url)}
                radius="none"
              >
                <CardContent padding={["50", "100"]}>
                  <Typography type="code">#{k.number}</Typography>
                </CardContent>
              </Card>
            </Container>
          ))}
        </>
      )}
    </Row>
  );
}
