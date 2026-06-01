"use client";

import { useState } from "react";
import {
  Button,
  EmptyState,
  EntityFormModal,
  HudPanel,
  Icon,
  Meter,
  Pill,
  RunModal,
  Stat,
  StatusDot,
  usageTone,
  type Skill,
} from "@zibby/design-system";
import { SkillTile } from "../skills/components/SkillTile";
import { AGENT_SDK, CLAUDE_LIMITS, PROJECTS } from "./config";
import { SKILL_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useDashboardContext } from "./dashboardContext";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function OverviewScreen() {
  const { context } = useDashboardContext();
  const { skills, integrations, agents, pipelines, addSkill } =
    useDashboardStore();
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
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* LEFT COLUMN */}
      <div className="flex min-w-0 flex-col gap-5">
        <HudPanel className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <StatusDot tone="ok" pulse />
                <span className="font-mono text-caption uppercase tracking-widest text-ok">
                  Systém · NOMINAL
                </span>
                <span className="ml-1 font-mono text-sm text-foreground-faint">
                  · démon připraven · žádné běhy
                </span>
              </div>
              <div className="mt-3 text-5xl font-semibold leading-tight tracking-tighter">
                Dobré ráno.{" "}
                <span className="text-foreground-dim">
                  {isFresh
                    ? "Dashboard je prázdný — postav si ho."
                    : "Vše běží hladce."}
                </span>
              </div>
            </div>
            <Pill tone="accent" className="whitespace-nowrap px-2.5 py-1.5">
              ctx · {context}
            </Pill>
          </div>
          <div className="mt-6 flex flex-wrap gap-9 border-t border-border pt-5">
            <Stat value="00" label="běžící agenti" icon="pulse" tone="accent" />
            <Stat value="00" label="schválení" icon="shield" tone="neutral" />
            <Stat
              value={`$${AGENT_SDK.remaining}`}
              label="agent sdk kredit"
              icon="dollar"
              tone={sdkTone}
            />
            <Stat
              value={pad2(ctxPipelines)}
              label="pipeline"
              icon="flow"
              tone="neutral"
            />
            <Stat
              value={pad2(ctxSkills)}
              label="skilly"
              icon="spark"
              tone="neutral"
            />
          </div>
        </HudPanel>

        {/* getting-started, only while fresh */}
        {isFresh && (
          <HudPanel title="začni tady · postav dashboard">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[
                {
                  id: "skills",
                  glyph: "spark" as const,
                  label: "Přidej skill",
                  sub: "SKILL.md — jednotka práce",
                },
                {
                  id: "integrations",
                  glyph: "plug" as const,
                  label: "Přidej integraci",
                  sub: "driver do okolního světa",
                },
                {
                  id: "agents",
                  glyph: "bot" as const,
                  label: "Přidej agenta",
                  sub: ".agent.md — model + nástroje",
                },
                {
                  id: "pipelines",
                  glyph: "flow" as const,
                  label: "Přidej pipeline",
                  sub: "zřetězení agentů",
                },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { /* navigation handled by links */ }}
                  className="flex items-center gap-3 rounded border border-border bg-surface-0 px-3 py-2.5 text-left outline-none transition-colors hover:border-accent/35 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-accent/20 bg-accent-dim text-accent">
                    <Icon name={s.glyph} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium text-foreground">
                      {s.label}
                    </span>
                    <span className="block truncate font-mono text-sm text-foreground-faint">
                      {s.sub}
                    </span>
                  </span>
                  <Icon
                    name="plus"
                    size={14}
                    className="text-foreground-faint"
                  />
                </button>
              ))}
            </div>
          </HudPanel>
        )}

        {/* quick launch */}
        <HudPanel
          title={`rychlé spuštění · ${context}`}
          action={
            <Button
              intent="ghost"
              icon="plus"
              size="sm"
              onClick={() => setAdding(true)}
            >
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {favorites.map((s) => (
                <SkillTile key={s.id} skill={s} onRun={setRunSkill} />
              ))}
            </div>
          )}
        </HudPanel>
      </div>

      {/* RIGHT RAIL */}
      <div className="flex min-w-0 flex-col gap-5">
        <HudPanel title="fronta schválení">
          <div className="flex items-center gap-2.5 py-2">
            <StatusDot tone="ok" />
            <span className="font-mono text-sm text-foreground-dim">
              žádná akce nečeká · ZIBBY sám neobjedná
            </span>
          </div>
        </HudPanel>

        <HudPanel title="běžící agenti">
          <div className="flex items-center gap-2.5 py-2">
            <StatusDot tone="faint" />
            <span className="font-mono text-sm text-foreground-dim">
              žádný agent neběží
            </span>
          </div>
        </HudPanel>

        <HudPanel title="rozpočty">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm tracking-wide text-ok">
              AGENT SDK KREDIT
            </span>
            <span className="font-mono text-xs text-foreground-faint">
              obnova {AGENT_SDK.renew}
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-4xl font-bold text-foreground">
              ${AGENT_SDK.remaining}
            </span>
            <span className="font-mono text-caption text-foreground-dim">
              / ${AGENT_SDK.total}
            </span>
          </div>
          <div className="mt-2">
            <Meter
              value={AGENT_SDK.usedPct}
              tone={sdkTone}
              height={6}
              glow
              label="Agent SDK kredit"
            />
          </div>
          <span className="mt-1.5 block font-mono text-xs text-foreground-faint">
            běhy agentů čerpají odsud
          </span>

          <div className="my-3.5 h-px bg-border-hi" />

          <span className="block font-mono text-sm tracking-wide text-foreground-faint">
            INTERAKTIVNÍ · CLAUDE CODE
          </span>
          {[CLAUDE_LIMITS.rolling, CLAUDE_LIMITS.weekly].map((d) => {
            const tone = usageTone(d.usedPct);
            return (
              <div key={d.label} className="mt-2.5">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="whitespace-nowrap font-mono text-sm text-foreground-dim">
                    {d.label}
                  </span>
                  <span className="font-mono text-sm font-bold text-ok">
                    {d.usedPct}%
                  </span>
                </div>
                <Meter
                  value={d.usedPct}
                  tone={tone}
                  height={5}
                  glow
                  label={d.label}
                />
              </div>
            );
          })}
        </HudPanel>
      </div>

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
    </div>
  );
}
