"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Chip,
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
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

const pad2 = (n: number) => String(n).padStart(2, "0");

const STARTERS = [
  { id: "skills", glyph: "spark" as const },
  { id: "integrations", glyph: "plug" as const },
  { id: "agents", glyph: "bot" as const },
  { id: "pipelines", glyph: "flow" as const },
];

export function Screen() {
  const t = useTranslations();
  const { context } = useGlobalStateContext();
  const { skills, integrations, agents, pipelines, addSkill } = useDashboardStore();
  const [runSkill, setRunSkill] = useState<Skill | null>(null);
  const [adding, setAdding] = useState(false);
  const form = useEntityForm("skill");

  const sdkTone = usageTone(AGENT_SDK.usedPct);
  const favorites = skills.filter((s) => s.ctx === context).slice(0, 6);
  const ctxSkills = skills.filter((s) => s.ctx === context).length;
  const ctxPipelines = pipelines.filter((p) => p.ctx === context).length;
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
          <HudPanel padding="300">
            <Stack gap="250">
              <Stack align="start" direction="row" gap="200" justify="between">
                <Container minW0>
                  <Stack gap="150">
                    <Stack wrap align="center" direction="row" gap="100">
                      <StatusDot pulse tone="ok" />
                      <Typography mono uppercase size="caption" tone="ok" tracking="widest" type="note">
                        {t("overview.systemNominal")}
                      </Typography>
                      <Typography mono size="sm" type="note" variant="tertiary">
                        {t("overview.daemonReady")}
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
                <Chip size="md" tone="accent">
                  {t("overview.ctxChip", { ctx: context })}
                </Chip>
              </Stack>
              <Divider />
              <Stack wrap direction="row" gap="450">
                <Stat icon="pulse" label={t("overview.statRunningAgents")} tone="accent" value="00" />
                <Stat icon="shield" label={t("overview.statApprovals")} tone="neutral" value="00" />
                <Stat icon="dollar" label={t("overview.statSdkCredit")} tone={sdkTone} value={`$${AGENT_SDK.remaining}`} />
                <Stat icon="flow" label={t("overview.statPipelines")} tone="neutral" value={pad2(ctxPipelines)} />
                <Stat icon="spark" label={t("overview.statSkills")} tone="neutral" value={pad2(ctxSkills)} />
              </Stack>
            </Stack>
          </HudPanel>

          {isFresh && (
            <HudPanel title={t("overview.starterTitle")}>
              <Grid cols={1} gap="100" sm={2}>
                {STARTERS.map((s) => (
                  <Pressable key={s.id} onClick={() => { /* navigation handled by links */ }}>
                    <Card interactive background="background" radius="default">
                      <Container padding={["100", "150"]}>
                        <Stack align="center" direction="row" gap="150">
                          <IconTile glyph={s.glyph} size="sm" />
                          <Container grow minW0>
                            <Typography align="left" size="base" type="note" weight="medium">
                              {t(`overview.starters.${s.id}.label`)}
                            </Typography>
                            <Typography mono truncate align="left" size="sm" type="note" variant="tertiary">
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

          <HudPanel
            action={
              <Button icon="plus" intent="ghost" onClick={() => setAdding(true)} size="sm">
                {t("skills.addSkill")}
              </Button>
            }
            title={t("overview.quickRun", { ctx: context })}
          >
            {favorites.length === 0 ? (
              <EmptyState
                actionLabel={t("skills.addSkill")}
                description={t("overview.quickRunEmptyDesc")}
                glyph="spark"
                hint={t("overview.quickRunEmptyHint")}
                onAction={() => setAdding(true)}
                title={t("overview.noSkills")}
              />
            ) : (
              <Grid cols={1} gap="150" sm={2}>
                {favorites.map((s) => (
                  <SkillTile key={s.id} onRun={setRunSkill} skill={s} />
                ))}
              </Grid>
            )}
          </HudPanel>
        </Stack>
      </Container>

      {/* RIGHT RAIL */}
      <Container minW0>
        <Stack gap="250">
          <LimitsPanel />

          <HudPanel title={t("overview.approvalsQueue")}>
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone="ok" />
              <Typography mono size="sm" type="note" variant="secondary">
                {t("overview.noApprovals")}
              </Typography>
            </Stack>
          </HudPanel>

          <HudPanel title={t("overview.runningAgents")}>
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone="faint" />
              <Typography mono size="sm" type="note" variant="secondary">
                {t("overview.noAgentsRunning")}
              </Typography>
            </Stack>
          </HudPanel>
        </Stack>
      </Container>

      {adding && (
        <EntityFormModal
          fields={form.fields}
          filePreview={form.filePreview}
          glyph={form.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            addSkill(values, t("defaults.skill"));
            setAdding(false);
          }}
          submitLabel={form.submitLabel}
          subtitle={form.subtitle}
          title={form.title}
        />
      )}

      {runSkill && (
        <RunModal
          key={runSkill.id}
          onClose={() => setRunSkill(null)}
          projects={[...PROJECTS]}
          skill={runSkill}
        />
      )}
    </Grid>
  );
}
