"use client";

import {
  Card,
  Container,
  Grid,
  Icon,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { useCatalog } from "../../state/store";
import { useAgentsQuery } from "../agents/queries";
import { useSkillsQuery } from "../skills/queries";
import { usePipelinesQuery } from "../pipelines/queries";
import { QuickLaunchPanel } from "./components/QuickLaunchPanel";
import { SummaryWidget } from "./SummaryWidget";

const STARTERS = [
  { id: "skills", glyph: "spark" },
  { id: "integrations", glyph: "plug" },
  { id: "agents", glyph: "bot" },
  { id: "pipelines", glyph: "flow" },
] as const;

export function Screen() {
  const t = useTranslations();
  const { integrations } = useCatalog();
  const { data: skills = [] } = useSkillsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: agents = [] } = useAgentsQuery();

  const isFresh =
    skills.length === 0 &&
    integrations.length === 0 &&
    agents.length === 0 &&
    pipelines.length === 0;

  // The limits / approvals / running-agents rail now lives in the app shell
  // (MainLayout) so it persists across pages — the overview body itself spans
  // the full content width.
  return (
    <Stack gap="250">
      <SummaryWidget />

      {agents.length > 0 && <QuickLaunchPanel />}

      {isFresh && (
        <HudPanel title={t("overview.starterTitle")}>
          <Grid cols={1} gap="100" sm={2}>
            {STARTERS.map((s) => (
              <Pressable
                key={s.id}
                onClick={() => {
                  /* navigation handled by links */
                }}
              >
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
              </Pressable>
            ))}
          </Grid>
        </HudPanel>
      )}
    </Stack>
  );
}
