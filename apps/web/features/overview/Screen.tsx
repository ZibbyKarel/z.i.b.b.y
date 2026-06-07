"use client";

import {
  Card,
  Container,
  Grid,
  Icon,
  IconTile,
  Pressable,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { LimitsPanel } from "../../components/layout/LimitsPanel/LimitsPanel";
import { useCatalog } from "../../state/store";
import { ApprovalCard } from "../agents/components/ApprovalCard/ApprovalCard";
import { RunningAgentsPanel } from "../agents/components/RunningAgentsPanel";
import { useAgentsQuery } from "../agents/queries";
import { useApproveMutation, useRejectMutation } from "../approvals/mutations";
import { useApprovalsQuery } from "../approvals/queries";
import { useSkillsQuery } from "../skills/queries";
import { usePipelinesQuery } from "../pipelines/queries";
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
  const { data: approvals = [] } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();

  const isFresh =
    skills.length === 0 &&
    integrations.length === 0 &&
    agents.length === 0 &&
    pipelines.length === 0;

  return (
    <Grid center align="start" gap="250" maxWidth="1400px" sidebar="right">
      {/* LEFT COLUMN */}
      <Container minW0>
        <Stack gap="250">
          <SummaryWidget />

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
      </Container>

      {/* RIGHT RAIL */}
      <Container minW0>
        <Stack gap="250">
          <LimitsPanel />

          <HudPanel title={t("overview.approvalsQueue")}>
            {approvals.length === 0 ? (
              <Stack align="center" direction="row" gap="100">
                <StatusDot tone="ok" />
                <Typography mono size="sm" type="note" variant="secondary">
                  {t("overview.noApprovals")}
                </Typography>
              </Stack>
            ) : (
              <Stack gap="150">
                {approvals.map((a) => (
                  <ApprovalCard
                    approval={a}
                    key={a.id}
                    onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
                    onReject={() => reject.mutate({ params: { id: a.id }, body: {} })}
                  />
                ))}
              </Stack>
            )}
          </HudPanel>

          <RunningAgentsPanel />
        </Stack>
      </Container>
    </Grid>
  );
}
