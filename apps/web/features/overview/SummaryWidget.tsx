"use client";

import {
  Container,
  Divider,
  Stack,
  Stat,
  StatusDot,
  Typography,
  usageTone,
} from "@zibby/design-system";
import { MessageKey } from "apps/web/i18n/keys";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { AGENT_SDK } from "../../state/config";
import { useCatalog } from "../../state/store";
import { useAgentsQuery } from "../agents/queries";
import { useHealthQuery } from "../health/queries";
import { usePipelinesQuery } from "../pipelines/queries";
import { useSkillsQuery } from "../skills/queries";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function SummaryWidget() {
  const t = useTranslations();
  const { integrations } = useCatalog();
  const { data: skills = [] } = useSkillsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();
  const { data: agents = [] } = useAgentsQuery();

  const { isFetching, isFetched, isSuccess } = useHealthQuery();
  const isConnecting = isFetching && !isFetched;
  const isOnline = isSuccess;

  const healthTone = isConnecting ? "warn" : isOnline ? "ok" : "bad";
  const healthLabel: MessageKey = isConnecting
    ? "overview.systemConnecting"
    : isOnline
      ? "overview.systemNominal"
      : "overview.systemOffline";

  const healthDetail: MessageKey = isOnline
    ? "overview.daemonReady"
    : "overview.apiUnreachable";

  const sdkTone = usageTone(AGENT_SDK.usedPct);

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
                <StatusDot pulse tone={healthTone} />
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
              <Typography
                leading="tight"
                tracking="tighter"
                type="pageTitle"
                weight="semibold"
              >
                {t("overview.title")}{" "}
                <Typography
                  as="span"
                  type="pageTitle"
                  variant="secondary"
                  weight="semibold"
                >
                  {isFresh
                    ? t("overview.emptyTitle")
                    : t("overview.allRunning")}
                </Typography>
              </Typography>
            </Stack>
          </Container>
        </Stack>
        <Divider />
        <Stack wrap direction="row" gap="450">
          <Stat
            icon="pulse"
            label={t("overview.statRunningAgents")}
            tone="accent"
            value="00"
          />
          <Stat
            icon="shield"
            label={t("overview.statApprovals")}
            tone="neutral"
            value="00"
          />
          <Stat
            icon="dollar"
            label={t("overview.statSdkCredit")}
            tone={sdkTone}
            value={`$${AGENT_SDK.remaining}`}
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
