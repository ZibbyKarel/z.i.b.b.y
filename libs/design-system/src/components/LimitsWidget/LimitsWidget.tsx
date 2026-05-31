import { useState } from "react"
import { cn } from "../../lib/cn"
import type { AgentSdkCredit, ClaudeLimits, QuotaLimit } from "../../domain"
import { Icon } from "../Icon/Icon"
import { Meter, usageTone } from "../Meter/Meter"
import { Sparkline } from "../Sparkline/Sparkline"
import { StatusDot, type DotTone } from "../StatusDot/StatusDot"

const toneText: Record<"ok" | "warn" | "bad" | "accent", string> = {
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  accent: "text-accent",
}

function MiniBar({ label, pct, width }: { label: string; pct: number; width: number }) {
  const tone = usageTone(pct)
  return (
    <div style={{ width }}>
      <div className="mb-1 flex justify-between">
        <span className="font-mono text-xs text-foreground-faint">{label}</span>
        <span className={cn("font-mono text-xs font-bold", toneText[tone])}>{pct}%</span>
      </div>
      <Meter value={pct} tone={tone} height={4} glow />
    </div>
  )
}

function LimitRow({ d }: { d: QuotaLimit }) {
  const tone = usageTone(d.usedPct)
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-sm tracking-wide text-foreground-dim">{d.label}</span>
        <span className={cn("font-mono text-sm font-semibold", toneText[tone])}>{d.usedPct}%</span>
      </div>
      <Meter value={d.usedPct} tone={tone} height={5} glow label={d.label} />
      <span className="mt-1.5 block font-mono text-xs text-foreground-faint">
        reset {d.resetIn} · {d.tokens}
      </span>
    </div>
  )
}

export interface LimitsWidgetProps {
  limits: ClaudeLimits
  credit: AgentSdkCredit
  className?: string
}

/**
 * The always-visible Claude quota widget: two separate wallets —
 * interactive Claude Code limits (5h + weekly) and the priority Agent SDK
 * credit ($). Click to expand the consumption breakdown.
 */
export function LimitsWidget({ limits, credit, className }: LimitsWidgetProps) {
  const [open, setOpen] = useState(false)
  const { rolling, weekly } = limits
  const sdkTone = usageTone(credit.usedPct)

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label="Limity Claude Code a Agent SDK kredit"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3.5 rounded border border-border bg-surface-0 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {/* A) interactive */}
        <div className="flex items-center gap-2.5">
          <span className="text-right font-mono text-2xs uppercase leading-tight tracking-wider text-foreground-faint">
            inter-
            <br />
            aktivní
          </span>
          <MiniBar label="5h" pct={rolling.usedPct} width={62} />
          <MiniBar label="týden" pct={weekly.usedPct} width={62} />
        </div>
        {/* divider */}
        <div className="h-7 w-px bg-border-hi" />
        {/* B) Agent SDK credit — priority */}
        <div className="flex items-center gap-2">
          <span className={cn("flex items-center gap-1.5", toneText[sdkTone])}>
            <Icon name="dollar" size={14} />
            <span className="font-mono text-2xs uppercase leading-tight tracking-wider text-foreground-faint">
              agent
              <br />
              sdk
            </span>
          </span>
          <div className="w-24">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-mono text-caption font-bold text-foreground">
                ${credit.remaining}
              </span>
              <span className="font-mono text-xs text-foreground-faint">/ ${credit.total}</span>
            </div>
            <Meter value={credit.usedPct} tone={sdkTone} height={5} glow />
          </div>
        </div>
        <Icon
          name="chevron"
          size={13}
          className={cn("text-foreground-faint transition-transform", open && "rotate-90")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] animate-scale-in rounded border border-border-hi bg-panel-hi p-5 shadow-dropdown">
          {/* A */}
          <span className="font-mono text-xs uppercase tracking-widest text-foreground-faint">
            Interaktivní limity · Claude Code
          </span>
          <div className="mt-3 flex flex-col gap-3.5">
            <LimitRow d={rolling} />
            <LimitRow d={weekly} />
          </div>
          <span className="mt-2.5 block font-mono text-xs text-foreground-faint">
            čerpá tvůj chat · nezávislé na agentech
          </span>

          <div className="my-4 h-px bg-border-hi" />

          {/* B */}
          <div className="flex items-center justify-between">
            <span className={cn("font-mono text-xs uppercase tracking-widest", toneText[sdkTone])}>
              Agent SDK kredit
            </span>
            <span className="font-mono text-xs text-foreground-faint">obnova {credit.renew}</span>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-5xl font-bold text-foreground">${credit.remaining}</span>
            <span className="font-mono text-base text-foreground-dim">zbývá z ${credit.total}</span>
          </div>
          <div className="mt-2.5">
            <Meter value={credit.usedPct} tone={sdkTone} height={6} glow />
          </div>
          <span className="mt-2 block font-mono text-xs text-foreground-faint">
            spotřebováno ${credit.used} · běhy agentů čerpají odsud
          </span>

          <div className="mt-3.5">
            <span className="font-mono text-xs tracking-wider text-foreground-faint">
              TREND 14 DNÍ ($/den)
            </span>
            <div className="mt-1.5">
              <Sparkline data={credit.trend} />
            </div>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-4">
            <BreakdownColumn title="PODLE AGENTA" rows={credit.byAgent} />
            <BreakdownColumn title="PODLE PIPELINE" rows={credit.byPipeline} />
          </div>

          <div className="mt-3.5 flex gap-4 border-t border-border pt-3">
            {credit.byContext.map(([ctx, dollars]) => (
              <div key={ctx} className="flex items-center gap-2">
                <StatusDot tone={ctx as DotTone} size={6} />
                <span className="font-mono text-sm text-foreground-dim">{ctx}</span>
                <span className="font-mono text-sm font-semibold text-foreground">${dollars}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BreakdownColumn({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, "home" | "work", number]>
}) {
  return (
    <div>
      <span className="font-mono text-xs tracking-wider text-foreground-faint">{title}</span>
      {rows.slice(0, 4).map(([name, ctx, dollars]) => (
        <div key={name} className="mt-2 flex items-center gap-2">
          <StatusDot tone={ctx} size={5} />
          <span className="flex-1 truncate font-mono text-sm text-foreground">{name}</span>
          <span className="font-mono text-sm text-foreground-dim">${dollars}</span>
        </div>
      ))}
    </div>
  )
}
