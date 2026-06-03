"use client";

import {
  Button,
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
import { useState } from "react";
import { Collection } from "../../components/Collection/Collection";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { LimitsPanel } from "../../components/layout/LimitsPanel/LimitsPanel";
import { type Skill, skillToAgent } from "../../domain";
import { PROJECTS } from "../../state/config";
import { useEntityForm } from "../../state/forms";
import { useCatalog } from "../../state/store";
import { RunningAgentsPanel } from "../agents/components/RunningAgentsPanel";
import { useAgentsQuery } from "../agents/queries";
import { RunModal } from "../skills/components/RunModal/RunModal";
import { SkillTile } from "../skills/components/SkillTile";
import { SummaryWidget } from "./SummaryWidget";

const STARTERS = [
  { id: "skills", glyph: "spark" },
  { id: "integrations", glyph: "plug" },
  { id: "agents", glyph: "bot" },
  { id: "pipelines", glyph: "flow" },
] as const;

export function Screen() {
  const t = useTranslations();
  const { skills, integrations, pipelines, addSkill } = useCatalog();
  const { data: agents = [] } = useAgentsQuery();
  const [runSkill, setRunSkill] = useState<Skill | null>(null);
  const [adding, setAdding] = useState(false);
  const form = useEntityForm("skill");

  const favorites = skills.slice(0, 6);

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

          <HudPanel
            action={
              <Button
                icon="plus"
                intent="ghost"
                onClick={() => setAdding(true)}
                size="sm"
              >
                {t("skills.addSkill")}
              </Button>
            }
            title={t("overview.quickRun")}
          >
            <Collection
              empty={{
                glyph: "spark",
                title: t("overview.noSkills"),
                description: t("overview.quickRunEmptyDesc"),
                actionLabel: t("skills.addSkill"),
                hint: t("overview.quickRunEmptyHint"),
                onAction: () => setAdding(true),
              }}
              items={favorites}
              lg={2}
              renderItem={(s) => (
                <SkillTile key={s.id} onRun={setRunSkill} skill={s} />
              )}
            />
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

          <RunningAgentsPanel />
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
          agent={skillToAgent(runSkill)}
          file={runSkill.file}
          key={runSkill.id}
          onClose={() => setRunSkill(null)}
          projects={[...PROJECTS]}
        />
      )}
    </Grid>
  );
}
