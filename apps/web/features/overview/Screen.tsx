"use client";

import { Card, Container, Grid, Icon, IconTile, Stack, Typography } from "@zibby/design-system";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { QueryError } from "../../components/LoadError/QueryError";
import { QueryLoading } from "../../components/LoadingState/QueryLoading";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { useAgentsQuery } from "../agents";
import { useIntegrationsQuery } from "../integrations";
import { usePipelinesQuery } from "../pipelines";
import { useSkillsQuery } from "../skills";
import { NeedsAttentionPanel } from "../integrations/components/NeedsAttentionPanel";
import { usePinToggle } from "../pins";
import { ParkedRunsPanel } from "../runs/components/ParkedRunsPanel";
import { ActivityFeed } from "./components/ActivityFeed/ActivityFeed";
import { ApprovalsPanel } from "./components/ApprovalsPanel";
import { BriefingCard } from "./components/BriefingCard/BriefingCard";
import { QuickLaunchPanel } from "./components/QuickLaunchPanel/QuickLaunchPanel";
import { useActivityQuery } from "./queries";
import { SummaryWidget } from "./SummaryWidget";

const STARTERS = [
  { id: "skills", glyph: "spark" },
  { id: "projects", glyph: "code" },
  { id: "agents", glyph: "bot" },
  { id: "pipelines", glyph: "flow" },
] as const;

export function Screen() {
  const t = useTranslations();
  const integrationsQuery = useIntegrationsQuery();
  const skillsQuery = useSkillsQuery();
  const pipelinesQuery = usePipelinesQuery();
  const agentsQuery = useAgentsQuery();
  const { data: integrations = [] } = integrationsQuery;
  const { data: skills = [] } = skillsQuery;
  const { data: pipelines = [] } = pipelinesQuery;
  const { data: agents = [] } = agentsQuery;
  const { data: activity = [] } = useActivityQuery();
  const { pins } = usePinToggle();

  // Honest load states (Phase 18.2): these four catalogs decide `isFresh` below, so a
  // pending/failed fetch must never read as a genuinely-empty workspace. Only when
  // EVERY primary query is pending/erroring does the whole dashboard swap to a single
  // loading/error state; a partial failure falls through to the normal render (each
  // section already defaults to `[]` on its own).
  const primaryQueries = [integrationsQuery, skillsQuery, pipelinesQuery, agentsQuery];
  const primaryPending = primaryQueries.every((q) => q.isPending);
  const primaryError = !primaryPending && primaryQueries.every((q) => q.isError);
  const retryPrimary = () => {
    void integrationsQuery.refetch();
    void skillsQuery.refetch();
    void pipelinesQuery.refetch();
    void agentsQuery.refetch();
  };

  const isFresh =
    skills.length === 0 &&
    integrations.length === 0 &&
    agents.length === 0 &&
    pipelines.length === 0;

  if (primaryPending) {
    return (
      <PageContainer>
        <Stack direction="col" gap="250">
          <SummaryWidget />
          <QueryLoading />
        </Stack>
      </PageContainer>
    );
  }

  if (primaryError) {
    return (
      <PageContainer>
        <Stack direction="col" gap="250">
          <SummaryWidget />
          <QueryError onRetry={retryPrimary} />
        </Stack>
      </PageContainer>
    );
  }

  // The needs-you queue: what actually wants the operator. Panels that have nothing
  // to show render null and simply drop out of the column.
  const queue = (
    <Stack direction="col" gap="250">
      <BriefingCard />

      {/* Approvals + parked runs — the needs-you queue that used to live in the
          right rail. */}
      <ApprovalsPanel />

      <ParkedRunsPanel />

      {/* "Needs your attention" — notify-only items ZIBBY surfaced (inbound mail that
          wants a reply or a decision) as summary cards linking to the original. */}
      <NeedsAttentionPanel />
    </Stack>
  );

  // Rail — actionable-but-not-urgent launchers + the live log. Only worth a column of
  // its own when it actually holds something; otherwise the queue takes the full width
  // rather than leaving a dead 360px gutter.
  const railHasContent = pins.length > 0 || activity.length > 0;

  return (
    <PageContainer>
      <Stack direction="col" gap="250">
        {/* Full-width HUD header: system health + the live stats banner. */}
        <SummaryWidget />

        {/* Dynamic two-zone dashboard: below lg it collapses to a single column, at lg+
            the needs-you queue (main) sits beside the launch + activity rail so the page
            uses its width instead of stacking every block full-bleed. */}
        {railHasContent ? (
          <Grid align="start" gap="250" sidebar="right">
            {queue}
            <Stack direction="col" gap="250">
              {/* Quick launch — pinned agents/pipelines/chains with a one-click RUN. */}
              <QuickLaunchPanel />

              {activity.length > 0 && (
                <HudPanel title={t("overview.activity")}>
                  <ActivityFeed items={activity} limit={8} />
                </HudPanel>
              )}
            </Stack>
          </Grid>
        ) : (
          queue
        )}

        {isFresh && (
          <HudPanel title={t("overview.starterTitle")}>
            <Grid cols={1} gap="150" md={4} sm={2}>
              {STARTERS.map((s) => (
                // Each starter deep-links to its dashboard segment (the ids ARE the route
                // segments). `Link` is a component, so react/forbid-dom-props doesn't apply
                // to its `style` — same pattern as BriefingCard's NeedsYouRow.
                <Link href={`/${s.id}`} key={s.id} style={{ display: "block" }}>
                  <Card interactive background="background" radius="default">
                    <Container padding={["100", "150"]}>
                      <Stack align="center" direction="row" gap="150">
                        <IconTile glyph={s.glyph} size="sm" />
                        <Container grow minW0>
                          <Typography align="left" size="base" type="note" weight="medium">
                            {t(`overview.starters.${s.id}.label`)}
                          </Typography>
                          <Typography
                            mono
                            truncate
                            align="left"
                            size="sm"
                            type="note"
                            variant="tertiary"
                          >
                            {t(`overview.starters.${s.id}.sub`)}
                          </Typography>
                        </Container>
                        <Icon name="plus" size="sm" tone="faint" />
                      </Stack>
                    </Container>
                  </Card>
                </Link>
              ))}
            </Grid>
          </HudPanel>
        )}
      </Stack>
    </PageContainer>
  );
}
