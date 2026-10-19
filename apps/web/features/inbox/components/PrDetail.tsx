"use client";

import type { InboxPr } from "@zibby/contracts";
import { Button, Container, Row, Stack, TextLink, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useInboxPrDiffQuery } from "../queries";
import { useElapsedLabel } from "../useElapsedLabel";
import { PrActions, hasPrActions } from "./PrActions";
import { ExternalAnchor } from "./links";

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
}

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
  /** Project name for the meta line; falls back to the repo. */
  projectName?: string | undefined;
  now: number;
}

/** The selected PR: fixed header (title, meta, GitHub link, actions) above its diff, which scrolls on its own at lg+. */
export function PrDetail({ pr, projectName, now }: PrDetailProps) {
  const t = useTranslations("inboxPage.prs");
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
      <Stack data-testid={PrDetailTestId.Header} gap="100" shrink={false}>
        <Row align="start" gap="150">
          <Typography mono nowrap size="xs" type="note" variant="secondary">
            #{pr.number}
          </Typography>
          <Container grow minW0>
            <Typography wrapAnywhere type="h3">
              {pr.title}
            </Typography>
          </Container>
          <TextLink
            data-testid={PrDetailTestId.GitHub}
            href={pr.url}
            linkComponent={ExternalAnchor}
          >
            <Typography type="label">{t("openGithub")}</Typography>
          </TextLink>
        </Row>
        <Typography type="label" variant="secondary">
          {[projectName ?? pr.repo, pr.author, elapsedLabel(pr.createdAt, now)].join(" · ")}
        </Typography>
        {hasPrActions(pr) && <PrActions pr={pr} />}
      </Stack>
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
