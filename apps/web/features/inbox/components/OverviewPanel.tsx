import {
  Container,
  Divider,
  type DotTone,
  Panel,
  Row,
  Stack,
  StatusDot,
  TextLink,
  Typography,
} from "@zibby/design-system";
import type { ReactNode } from "react";
import { NavLink } from "./links";

export enum OverviewPanelTestId {
  Headline = "inbox-overview-headline",
  Bucket = "inbox-overview-bucket",
  Empty = "inbox-overview-empty",
  Open = "inbox-overview-open",
}

export interface OverviewPanelProps {
  header: string;
  headerEnd: string;
  headline: ReactNode;
  buckets: { id: string; tone: DotTone; label: string; n: string }[];
  /** Pre-rendered top rows; none shows `emptyText`. */
  rows: ReactNode[];
  emptyText: string;
  openHref: string;
  openLabel: string;
  testId?: string;
}

/** One Overview card: header bar, headline counter, buckets, a few top rows, "Open →". */
export function OverviewPanel({
  header,
  headerEnd,
  headline,
  buckets,
  rows,
  emptyText,
  openHref,
  openLabel,
  testId,
}: OverviewPanelProps) {
  return (
    <Panel data-testid={testId} header={header} headerEnd={headerEnd} radius="none">
      <Stack gap="0">
        <Container padding={["200", "250"]}>
          <Stack gap="150">
            <Typography data-testid={OverviewPanelTestId.Headline} type="h2">
              {headline}
            </Typography>
            <Stack gap="100">
              {buckets.map((b) => (
                <Row gap="100" key={b.id}>
                  <StatusDot size="100" tone={b.tone} />
                  <Container grow>
                    <Typography type="label" variant="primary">
                      {b.label}
                    </Typography>
                  </Container>
                  <Typography
                    mono
                    data-testid={`${OverviewPanelTestId.Bucket}-${b.id}`}
                    size="sm"
                    type="note"
                  >
                    {b.n}
                  </Typography>
                </Row>
              ))}
            </Stack>
          </Stack>
        </Container>
        <Divider />
        {rows.length > 0 ? (
          <Stack gap="0">{rows}</Stack>
        ) : (
          <Container padding={["150", "250"]}>
            <Typography data-testid={OverviewPanelTestId.Empty} type="bodySm" variant="secondary">
              {emptyText}
            </Typography>
          </Container>
        )}
        <Container padding={["150", "250"]} textAlign="right">
          <TextLink data-testid={OverviewPanelTestId.Open} href={openHref} linkComponent={NavLink}>
            <Typography type="label" variant="primary">
              {openLabel}
            </Typography>
          </TextLink>
        </Container>
      </Stack>
    </Panel>
  );
}

/** A clickable top row of an Overview card (link to a detail / focused PR). */
export function OverviewRow({
  href,
  lead,
  title,
  sub,
  trailing,
  testId,
}: {
  href: string;
  lead: string;
  title: string;
  sub?: string;
  trailing: ReactNode;
  testId?: string;
}) {
  return (
    <>
      <Container padding={["100", "250"]}>
        <TextLink data-testid={testId} href={href} linkComponent={NavLink}>
          <Row gap="150">
            <Container shrink={false} width="4.5rem">
              <Typography mono size="xs" type="note" variant="secondary">
                {lead}
              </Typography>
            </Container>
            <Container grow minW0>
              <Stack gap="25">
                <Typography truncate type="bodySm">
                  {title}
                </Typography>
                {sub && <Typography type="label">{sub}</Typography>}
              </Stack>
            </Container>
            <Container shrink={false}>{trailing}</Container>
          </Row>
        </TextLink>
      </Container>
      <Divider />
    </>
  );
}
