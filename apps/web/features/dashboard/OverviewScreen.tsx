"use client";

import { useState } from "react";
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
  Progress,
  Stack,
  Stat,
  StatusDot,
  Typography,
  usageTone,
} from "@zibby/design-system";
import type { Skill } from "../../domain";
import { HudPanel } from "./components/HudPanel";
import { EntityFormModal } from "./components/EntityFormModal";
import { EmptyState } from "./components/EmptyState";
import { SkillTile } from "../skills/components/SkillTile";
import { RunModal } from "../skills/components/RunModal";
import { AGENT_SDK, CLAUDE_LIMITS, PROJECTS } from "./config";
import { SKILL_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

const pad2 = (n: number) => String(n).padStart(2, "0");

const STARTERS = [
  { id: "skills", glyph: "spark" as const, label: "Přidej skill", sub: "SKILL.md — jednotka práce" },
  { id: "integrations", glyph: "plug" as const, label: "Přidej integraci", sub: "driver do okolního světa" },
  { id: "agents", glyph: "bot" as const, label: "Přidej agenta", sub: ".agent.md — model + nástroje" },
  { id: "pipelines", glyph: "flow" as const, label: "Přidej pipeline", sub: "zřetězení agentů" },
];

export function OverviewScreen() {
  const { context } = useGlobalStateContext();
  const { skills, integrations, agents, pipelines, addSkill } = useDashboardStore();
  const [runSkill, setRunSkill] = useState<Skill | null>(null);
  const [adding, setAdding] = useState(false);

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
                        Systém · NOMINAL
                      </Typography>
                      <Typography mono size="sm" type="note" variant="tertiary">
                        · démon připraven · žádné běhy
                      </Typography>
                    </Stack>
                    <Typography leading="tight" tracking="tighter" type="pageTitle" weight="semibold">
                      Dobré ráno.{" "}
                      <Typography as="span" type="pageTitle" variant="secondary" weight="semibold">
                        {isFresh ? "Dashboard je prázdný — postav si ho." : "Vše běží hladce."}
                      </Typography>
                    </Typography>
                  </Stack>
                </Container>
                <Chip size="md" tone="accent">
                  ctx · {context}
                </Chip>
              </Stack>
              <Divider />
              <Stack wrap direction="row" gap="450">
                <Stat icon="pulse" label="běžící agenti" tone="accent" value="00" />
                <Stat icon="shield" label="schválení" tone="neutral" value="00" />
                <Stat icon="dollar" label="agent sdk kredit" tone={sdkTone} value={`$${AGENT_SDK.remaining}`} />
                <Stat icon="flow" label="pipeline" tone="neutral" value={pad2(ctxPipelines)} />
                <Stat icon="spark" label="skilly" tone="neutral" value={pad2(ctxSkills)} />
              </Stack>
            </Stack>
          </HudPanel>

          {isFresh && (
            <HudPanel title="začni tady · postav dashboard">
              <Grid cols={1} gap="100" sm={2}>
                {STARTERS.map((s) => (
                  <Pressable key={s.id} onClick={() => { /* navigation handled by links */ }}>
                    <Card interactive background="background" radius="default">
                      <Container padding={["100", "150"]}>
                        <Stack align="center" direction="row" gap="150">
                          <IconTile glyph={s.glyph} size="sm" />
                          <Container grow minW0>
                            <Typography align="left" size="base" type="note" weight="medium">
                              {s.label}
                            </Typography>
                            <Typography mono truncate align="left" size="sm" type="note" variant="tertiary">
                              {s.sub}
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
                Přidat skill
              </Button>
            }
            title={`rychlé spuštění · ${context}`}
          >
            {favorites.length === 0 ? (
              <EmptyState
                actionLabel="Přidat skill"
                description="Přidej skill a objeví se tu jako dlaždice s čudlíkem Spustit."
                glyph="spark"
                hint="// ~/zibby/skills/<název>/SKILL.md"
                onAction={() => setAdding(true)}
                title="Žádné skilly k spuštění"
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
          <HudPanel title="fronta schválení">
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone="ok" />
              <Typography mono size="sm" type="note" variant="secondary">
                žádná akce nečeká · ZIBBY sám neobjedná
              </Typography>
            </Stack>
          </HudPanel>

          <HudPanel title="běžící agenti">
            <Stack align="center" direction="row" gap="100">
              <StatusDot tone="faint" />
              <Typography mono size="sm" type="note" variant="secondary">
                žádný agent neběží
              </Typography>
            </Stack>
          </HudPanel>

          <HudPanel title="rozpočty">
            <Stack gap="100">
              <Stack align="center" direction="row" justify="between">
                <Typography mono size="sm" tone="ok" tracking="wide" type="note">
                  AGENT SDK KREDIT
                </Typography>
                <Typography mono size="xs" type="note" variant="tertiary">
                  obnova {AGENT_SDK.renew}
                </Typography>
              </Stack>
              <Stack align="baseline" direction="row" gap="75">
                <Typography mono size="4xl" type="note" weight="bold">
                  ${AGENT_SDK.remaining}
                </Typography>
                <Typography mono size="caption" type="note" variant="secondary">
                  / ${AGENT_SDK.total}
                </Typography>
              </Stack>
              <Progress glow height="75" label="Agent SDK kredit" tone={sdkTone} value={AGENT_SDK.usedPct} />
              <Typography mono size="xs" type="note" variant="tertiary">
                běhy agentů čerpají odsud
              </Typography>

              <Divider />

              <Typography mono size="sm" tracking="wide" type="note" variant="tertiary">
                INTERAKTIVNÍ · CLAUDE CODE
              </Typography>
              {[CLAUDE_LIMITS.rolling, CLAUDE_LIMITS.weekly].map((d) => {
                const tone = usageTone(d.usedPct);
                return (
                  <Stack gap="50" key={d.label}>
                    <Stack align="baseline" direction="row" justify="between">
                      <Typography mono nowrap size="sm" type="note" variant="secondary">
                        {d.label}
                      </Typography>
                      <Typography mono size="sm" tone="ok" type="note" weight="bold">
                        {d.usedPct}%
                      </Typography>
                    </Stack>
                    <Progress glow height="50" label={d.label} tone={tone} value={d.usedPct} />
                  </Stack>
                );
              })}
            </Stack>
          </HudPanel>
        </Stack>
      </Container>

      {adding && (
        <EntityFormModal
          fields={SKILL_FORM.fields}
          filePreview={SKILL_FORM.filePreview}
          glyph={SKILL_FORM.glyph}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            addSkill(values);
            setAdding(false);
          }}
          submitLabel={SKILL_FORM.submitLabel}
          subtitle={SKILL_FORM.subtitle}
          title={SKILL_FORM.title}
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
