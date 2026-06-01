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
import { useDashboardContext } from "./dashboardContext";

const pad2 = (n: number) => String(n).padStart(2, "0");

const STARTERS = [
  { id: "skills", glyph: "spark" as const, label: "Přidej skill", sub: "SKILL.md — jednotka práce" },
  { id: "integrations", glyph: "plug" as const, label: "Přidej integraci", sub: "driver do okolního světa" },
  { id: "agents", glyph: "bot" as const, label: "Přidej agenta", sub: ".agent.md — model + nástroje" },
  { id: "pipelines", glyph: "flow" as const, label: "Přidej pipeline", sub: "zřetězení agentů" },
];

export function OverviewScreen() {
  const { context } = useDashboardContext();
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
    <Grid sidebar="right" center maxWidth="1400px" gap="250" align="start">
      {/* LEFT COLUMN */}
      <Container minW0>
        <Stack gap="250">
          <HudPanel padding="300">
            <Stack gap="250">
              <Stack direction="row" align="start" justify="between" gap="200">
                <Container minW0>
                  <Stack gap="150">
                    <Stack direction="row" align="center" gap="100" wrap>
                      <StatusDot tone="ok" pulse />
                      <Typography type="note" mono size="caption" uppercase tracking="widest" tone="ok">
                        Systém · NOMINAL
                      </Typography>
                      <Typography type="note" mono size="sm" variant="tertiary">
                        · démon připraven · žádné běhy
                      </Typography>
                    </Stack>
                    <Typography type="pageTitle" weight="semibold" leading="tight" tracking="tighter">
                      Dobré ráno.{" "}
                      <Typography as="span" type="pageTitle" weight="semibold" variant="secondary">
                        {isFresh ? "Dashboard je prázdný — postav si ho." : "Vše běží hladce."}
                      </Typography>
                    </Typography>
                  </Stack>
                </Container>
                <Chip tone="accent" size="md">
                  ctx · {context}
                </Chip>
              </Stack>
              <Divider />
              <Stack direction="row" wrap gap="450">
                <Stat value="00" label="běžící agenti" icon="pulse" tone="accent" />
                <Stat value="00" label="schválení" icon="shield" tone="neutral" />
                <Stat value={`$${AGENT_SDK.remaining}`} label="agent sdk kredit" icon="dollar" tone={sdkTone} />
                <Stat value={pad2(ctxPipelines)} label="pipeline" icon="flow" tone="neutral" />
                <Stat value={pad2(ctxSkills)} label="skilly" icon="spark" tone="neutral" />
              </Stack>
            </Stack>
          </HudPanel>

          {isFresh && (
            <HudPanel title="začni tady · postav dashboard">
              <Grid cols={1} sm={2} gap="100">
                {STARTERS.map((s) => (
                  <Pressable key={s.id} onClick={() => { /* navigation handled by links */ }}>
                    <Card background="background" radius="default" interactive>
                      <Container padding={["100", "150"]}>
                        <Stack direction="row" align="center" gap="150">
                          <IconTile glyph={s.glyph} size="sm" />
                          <Container grow minW0>
                            <Typography type="note" size="base" weight="medium" align="left">
                              {s.label}
                            </Typography>
                            <Typography type="note" mono size="sm" variant="tertiary" truncate align="left">
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
            title={`rychlé spuštění · ${context}`}
            action={
              <Button intent="ghost" icon="plus" size="sm" onClick={() => setAdding(true)}>
                Přidat skill
              </Button>
            }
          >
            {favorites.length === 0 ? (
              <EmptyState
                glyph="spark"
                title="Žádné skilly k spuštění"
                description="Přidej skill a objeví se tu jako dlaždice s čudlíkem Spustit."
                actionLabel="Přidat skill"
                onAction={() => setAdding(true)}
                hint="// ~/zibby/skills/<název>/SKILL.md"
              />
            ) : (
              <Grid cols={1} sm={2} gap="150">
                {favorites.map((s) => (
                  <SkillTile key={s.id} skill={s} onRun={setRunSkill} />
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
            <Stack direction="row" align="center" gap="100">
              <StatusDot tone="ok" />
              <Typography type="note" mono size="sm" variant="secondary">
                žádná akce nečeká · ZIBBY sám neobjedná
              </Typography>
            </Stack>
          </HudPanel>

          <HudPanel title="běžící agenti">
            <Stack direction="row" align="center" gap="100">
              <StatusDot tone="faint" />
              <Typography type="note" mono size="sm" variant="secondary">
                žádný agent neběží
              </Typography>
            </Stack>
          </HudPanel>

          <HudPanel title="rozpočty">
            <Stack gap="100">
              <Stack direction="row" align="center" justify="between">
                <Typography type="note" mono size="sm" tracking="wide" tone="ok">
                  AGENT SDK KREDIT
                </Typography>
                <Typography type="note" mono size="xs" variant="tertiary">
                  obnova {AGENT_SDK.renew}
                </Typography>
              </Stack>
              <Stack direction="row" align="baseline" gap="75">
                <Typography type="note" mono size="4xl" weight="bold">
                  ${AGENT_SDK.remaining}
                </Typography>
                <Typography type="note" mono size="caption" variant="secondary">
                  / ${AGENT_SDK.total}
                </Typography>
              </Stack>
              <Progress value={AGENT_SDK.usedPct} tone={sdkTone} height="75" glow label="Agent SDK kredit" />
              <Typography type="note" mono size="xs" variant="tertiary">
                běhy agentů čerpají odsud
              </Typography>

              <Divider />

              <Typography type="note" mono size="sm" tracking="wide" variant="tertiary">
                INTERAKTIVNÍ · CLAUDE CODE
              </Typography>
              {[CLAUDE_LIMITS.rolling, CLAUDE_LIMITS.weekly].map((d) => {
                const tone = usageTone(d.usedPct);
                return (
                  <Stack key={d.label} gap="50">
                    <Stack direction="row" align="baseline" justify="between">
                      <Typography type="note" mono size="sm" variant="secondary" nowrap>
                        {d.label}
                      </Typography>
                      <Typography type="note" mono size="sm" weight="bold" tone="ok">
                        {d.usedPct}%
                      </Typography>
                    </Stack>
                    <Progress value={d.usedPct} tone={tone} height="50" glow label={d.label} />
                  </Stack>
                );
              })}
            </Stack>
          </HudPanel>
        </Stack>
      </Container>

      {adding && (
        <EntityFormModal
          title={SKILL_FORM.title}
          subtitle={SKILL_FORM.subtitle}
          glyph={SKILL_FORM.glyph}
          fields={SKILL_FORM.fields}
          submitLabel={SKILL_FORM.submitLabel}
          filePreview={SKILL_FORM.filePreview}
          onClose={() => setAdding(false)}
          onSubmit={(values) => {
            addSkill(values);
            setAdding(false);
          }}
        />
      )}

      {runSkill && (
        <RunModal
          key={runSkill.id}
          skill={runSkill}
          projects={[...PROJECTS]}
          onClose={() => setRunSkill(null)}
        />
      )}
    </Grid>
  );
}
