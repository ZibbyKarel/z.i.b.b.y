"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Divider,
  Grid,
  Icon,
  IconTile,
  Pressable,
  Stack,
  Stat,
  StatusDot,
  Typography,
  usageTone,
} from "@zibby/design-system";
import type { Skill } from "../../domain";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { LimitsPanel } from "../../components/layout/LimitsPanel";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { SkillTile } from "../skills/components/SkillTile";
import { RunModal } from "../skills/components/RunModal/RunModal";
import { AGENT_SDK, PROJECTS } from "../../state/config";
import { useEntityForm } from "../../state/forms";
import { useDashboardStore } from "../../state/store";
import { useHealth } from "../health/queries";

const pad2 = (n: number) => String(n).padStart(2, "0");

const STARTERS = [
  { id: "skills", glyph: "spark" as const },
  { id: "integrations", glyph: "plug" as const },
  { id: "agents", glyph: "bot" as const },
  { id: "pipelines", glyph: "flow" as const },
];

export function SummaryWidget() {
  const t = useTranslations();
  const { skills, integrations, agents, pipelines, addSkill } =
    useDashboardStore();
  const [runSkill, setRunSkill] = useState<Skill | null>(null);
  const [adding, setAdding] = useState(false);
  const form = useEntityForm("skill");

  const { isFetching, isFetched, data } = useHealth();
  const isConnecting = isFetching && !isFetched;
  const isOnline = data?.body.status === "ok";

  const healthTone = isConnecting ? "warn" : isOnline ? "ok" : "bad";
  const healthLabel = isConnecting
    ? "overview.systemConnecting"
    : isOnline
      ? "overview.systemNominal"
      : "overview.systemOffline";
  const healthDetail = isOnline
    ? "overview.daemonReady"
    : "overview.apiUnreachable";

  const sdkTone = usageTone(AGENT_SDK.usedPct);
  const favorites = skills.slice(0, 6);
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
