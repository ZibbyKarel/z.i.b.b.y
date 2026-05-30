"use client"

import { useState } from "react"
import {
  ActivityFeed,
  AgentRow,
  ApprovalCard,
  Button,
  HudPanel,
  Icon,
  Meter,
  Pill,
  RunModal,
  SkillTile,
  Stat,
  StatusDot,
  usageTone,
  type ContextName,
  type Skill,
} from "@zibby/design-system"
import { PROJECTS } from "./fixtures"
import { useOverviewQuery } from "./queries"

const briefingTone = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
} as const

export interface OverviewScreenProps {
  context: ContextName
}

/** The velín home screen: system status, morning briefing, quick-launch + right rail. */
export function OverviewScreen({ context }: OverviewScreenProps) {
  const { data } = useOverviewQuery(context)
  const [runSkill, setRunSkill] = useState<Skill | null>(null)

  if (!data) return <ScreenSkeleton />

  const { favorites, running, approvals, briefing, system, credit, limits } = data
  const sdkTone = usageTone(credit.usedPct)

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
                  · démon na {system.host}
                  {system.awake ? " · vzhůru" : ""}
                </span>
              </div>
              <div className="mt-3 text-5xl font-semibold leading-tight tracking-tighter">
                Dobré ráno. <span className="text-foreground-dim">2 agenti pracují,</span> 1 čeká na
                tebe.
              </div>
            </div>
            <Pill tone="accent" className="whitespace-nowrap px-2.5 py-1.5">
              ctx · {context}
            </Pill>
          </div>
          <div className="mt-6 flex flex-wrap gap-9 border-t border-border pt-5">
            <Stat value="02" label="běžící agenti" icon="pulse" tone="accent" />
            <Stat value="01" label="schválení" icon="shield" tone="bad" />
            <Stat value={`$${credit.remaining}`} label="agent sdk kredit" icon="dollar" tone={sdkTone} />
            <Stat value={String(system.pipelines).padStart(2, "0")} label="pipeline" icon="flow" tone="neutral" />
            <Stat value={context === "work" ? "05" : "09"} label="skilly" icon="spark" tone="neutral" />
          </div>
        </HudPanel>

        <HudPanel title="co se stalo přes noc · ranní brífink">
          <div className="flex flex-col gap-2.5">
            {briefing.map((r) => (
              <div
                key={r.title}
                className="flex items-center gap-3 rounded border border-border bg-surface-0 px-3 py-2.5"
              >
                <Icon name={r.icon} size={16} className={briefingTone[r.tone]} />
                <div className="min-w-0 flex-1">
                  <div className="text-base font-medium text-foreground">{r.title}</div>
                  <span className="mt-0.5 block truncate font-mono text-sm text-foreground-faint">
                    {r.sub}
                  </span>
                </div>
                <Icon name="chevron" size={14} className="text-foreground-faint" />
              </div>
            ))}
          </div>
        </HudPanel>

        <HudPanel
          title={`rychlé spuštění · ${context}`}
          action={
            <Button intent="ghost" icon="plus" size="sm">
              Přidat skill
            </Button>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {favorites.map((s) => (
              <SkillTile key={s.id} skill={s} onRun={setRunSkill} />
            ))}
          </div>
        </HudPanel>
      </div>

      {/* RIGHT RAIL */}
      <div className="flex min-w-0 flex-col gap-5">
        {approvals.map((a) => (
          <ApprovalCard key={a.id} approval={a} />
        ))}

        <HudPanel title="běžící agenti">
          {running.map((a) => (
            <AgentRow key={a.id} agent={a} />
          ))}
          <div className="mt-3">
            <Button intent="ghost" icon="pulse" size="sm">
              Otevřít aktivitu
            </Button>
          </div>
        </HudPanel>

        <HudPanel title="rozpočty">
          <div className="flex items-center justify-between">
            <span className={`font-mono text-sm tracking-wide ${sdkTone === "bad" ? "text-bad" : sdkTone === "warn" ? "text-warn" : "text-ok"}`}>
              AGENT SDK KREDIT
            </span>
            <span className="font-mono text-xs text-foreground-faint">obnova {credit.renew}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-4xl font-bold text-foreground">${credit.remaining}</span>
            <span className="font-mono text-caption text-foreground-dim">/ ${credit.total}</span>
          </div>
          <div className="mt-2">
            <Meter value={credit.usedPct} tone={sdkTone} height={6} glow label="Agent SDK kredit" />
          </div>
          <span className="mt-1.5 block font-mono text-xs text-foreground-faint">
            běhy agentů čerpají odsud
          </span>

          <div className="my-3.5 h-px bg-border-hi" />

          <span className="block font-mono text-sm tracking-wide text-foreground-faint">
            INTERAKTIVNÍ · CLAUDE CODE
          </span>
          {[limits.rolling, limits.weekly].map((d) => {
            const tone = usageTone(d.usedPct)
            return (
              <div key={d.label} className="mt-2.5">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <span className="whitespace-nowrap font-mono text-sm text-foreground-dim">
                    {d.label}
                  </span>
                  <span
                    className={`font-mono text-sm font-bold ${tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ok"}`}
                  >
                    {d.usedPct}%
                  </span>
                </div>
                <Meter value={d.usedPct} tone={tone} height={5} glow label={d.label} />
              </div>
            )
          })}
        </HudPanel>
      </div>

      {runSkill && (
        <RunModal
          key={runSkill.id}
          skill={runSkill}
          projects={[...PROJECTS]}
          onClose={() => setRunSkill(null)}
        />
      )}
    </div>
  )
}

function ScreenSkeleton() {
  return (
    <div className="mx-auto max-w-[1400px]">
      <HudPanel className="p-6">
        <span className="font-mono text-sm text-foreground-faint">// načítám velín…</span>
      </HudPanel>
    </div>
  )
}
