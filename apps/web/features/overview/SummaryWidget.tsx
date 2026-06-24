"use client";

import { Container, Divider, Stack, Stat, StatusDot, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { useIntegrationsQuery } from "../integrations";
import { useAgentsQuery } from "../agents";
import { useApprovalsQuery } from "../approvals";
import { useHealthQuery } from "../health";
import { usePipelinesQuery } from "../pipelines";
import { useRunsQuery } from "../runs";
import { useSkillsQuery } from "../skills";
import { SUBSYSTEM_LABEL, deriveHealthPresentation, subsystemDotTone } from "./healthPresentation";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function SummaryWidget() {
  const t = useTranslations();
  const { data: integrations = [] } = useIntegrationsQuery();
  const { data: skills = [] } = useSkillsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: agents = [] } = useAgentsQuery();
  const { runs } = useRunsQuery();
  const { data: approvals = [] } = useApprovalsQuery();

  // "Always accountable" shouldn't ship over fake zeros: derive the two live
  // stats from the queries already mounted on this page.
  const runningAgents = runs.filter((r) => r.status === "running").length;
  const pendingApprovals = approvals.length;

  const { data: health, isFetching, isFetched, isSuccess } = useHealthQuery();
  const {
    tone: healthTone,
    dotTone: healthDotTone,
    pulse: healthPulse,
    label: healthLabel,
    detail: healthDetail,
  } = deriveHealthPresentation({
    isConnecting: isFetching && !isFetched,
    isOnline: isSuccess,
    isDegraded: health?.status === "degraded",
  });

  const ctxSkills = skills.length;
  const ctxPipelines = pipelines.length;
  const isFresh =
    skills.length === 0 &&
    integrations.length === 0 &&
    agents.length === 0 &&
    pipelines.length === 0;

  return (
    <HudPanel padding="300" tone={healthTone}>
      <Stack gap="250">
        <Stack align="start" direction="row" gap="200" justify="between">
          <Container minW0>
            <Stack gap="150">
              <Stack wrap align="center" direction="row" gap="100">
                <StatusDot pulse={healthPulse} tone={healthDotTone} />
                <Typography
                  mono
                  uppercase
                  size="caption"
                  tone={healthTone}
                  tracking="widest"
                  type="note"
                >
                  {t(healthLabel)}
                </Typography>
                <Typography mono size="sm" type="note" variant="tertiary">
                  {t(healthDetail)}
                </Typography>
              </Stack>
              <Typography leading="tight" tracking="tighter" type="pageTitle" weight="semibold">
                {t("overview.title")}{" "}
                <Typography as="span" type="pageTitle" variant="secondary" weight="semibold">
                  {isFresh ? t("overview.emptyTitle") : t("overview.allRunning")}
                </Typography>
              </Typography>
            </Stack>
          </Container>
        </Stack>
        {health?.subsystems && health.subsystems.length > 0 ? (
          <>
            <Divider />
            <Stack wrap align="center" direction="row" gap="300">
              {health.subsystems.map((s) => (
                <Stack align="center" direction="row" gap="100" key={s.name}>
                  <StatusDot tone={subsystemDotTone(s.status)} />
                  <Typography mono size="sm" type="note" variant="tertiary">
                    {t(SUBSYSTEM_LABEL[s.name])}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </>
        ) : null}
        <Divider />
        <Stack wrap direction="row" gap="450">
          <Stat
            icon="pulse"
            label={t("overview.statRunningAgents")}
            tone="accent"
            value={pad2(runningAgents)}
          />
          <Stat
            icon="shield"
            label={t("overview.statApprovals")}
            tone={pendingApprovals > 0 ? "accent" : "neutral"}
            value={pad2(pendingApprovals)}
          />
          <Stat
            icon="flow"
            label={t("overview.statPipelines")}
            tone="neutral"
            value={pad2(ctxPipelines)}
          />
          <Stat
            icon="spark"
            label={t("overview.statSkills")}
            tone="neutral"
            value={pad2(ctxSkills)}
          />
        </Stack>
      </Stack>
    </HudPanel>
  );
}
