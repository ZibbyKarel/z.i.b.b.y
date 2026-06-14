"use client";

import {
  Card,
  Container,
  Grid,
  Icon,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { useAgentsQuery } from "../agents/queries";
import { useIntegrationsQuery } from "../integrations/queries";
import { usePipelinesQuery } from "../pipelines/queries";
import { useSkillsQuery } from "../skills/queries";
import { ActivityFeed } from "./components/ActivityFeed/ActivityFeed";
import { BriefingCard } from "./components/BriefingCard/BriefingCard";
import { useActivityQuery } from "./queries";
import { SummaryWidget } from "./SummaryWidget";

const STARTERS = [
  { id: "skills", glyph: "spark" },
  { id: "integrations", glyph: "plug" },
  { id: "agents", glyph: "bot" },
  { id: "pipelines", glyph: "flow" },
] as const;

export function Screen() {
  const t = useTranslations();
  const { data: integrations = [] } = useIntegrationsQuery();
  const { data: skills = [] } = useSkillsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: agents = [] } = useAgentsQuery();
  const { data: activity = [] } = useActivityQuery();

  const isFresh =
    skills.length === 0 &&
    integrations.length === 0 &&
    agents.length === 0 &&
    pipelines.length === 0;

  return (
    <PageContainer>
      <Stack direction="col" gap="200">
        <SummaryWidget />

        <BriefingCard />

        {activity.length > 0 && (
          <HudPanel title={t("overview.activity")}>
            <ActivityFeed items={activity} limit={8} />
          </HudPanel>
        )}

        {isFresh && (
          <HudPanel title={t("overview.starterTitle")}>
            <Grid cols={1} gap="100" sm={2}>
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
                          <Typography
                            align="left"
                            size="base"
                            type="note"
                            weight="medium"
                          >
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
