import { Fragment } from "react"
import {
  cn,
  Corners,
  Icon,
  Chip,
  glyphForAgent,
  type AgentDef,
  type Pipeline,
  type PipelineState,
} from "@zibby/design-system"

const stateMeta: Record<PipelineState, { tone: "ok" | "warn" | "bad" | "accent"; label: string }> = {
  done: { tone: "ok", label: "hotovo" },
  parked: { tone: "warn", label: "zaparkováno" },
  failed: { tone: "bad", label: "selhalo" },
  running: { tone: "accent", label: "běží" },
}

export interface PipelineCardProps {
  pipeline: Pipeline
  agents: AgentDef[]
  selected: boolean
  onSelect: (id: string) => void
  className?: string
}

/** Master-list card for a pipeline: name, state, phase chips, budget + last run. */
export function PipelineCard({
  pipeline,
  agents,
  selected,
  onSelect,
  className,
}: PipelineCardProps) {
  const sm = stateMeta[pipeline.lastState]
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(pipeline.id)}
      className={cn(
        "group relative w-full rounded border p-3.5 text-left transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-accent",
        selected
          ? "border-accent bg-raised shadow-[0_0_0_1px_var(--color-accent-dim)]"
          : "border-border bg-elevated hover:border-accent/35",
        className,
      )}
    >
      {selected && <Corners inset="75" />}
      <div className="flex items-center justify-between">
        <span className="font-mono text-md font-bold text-foreground">{pipeline.name}</span>
        <Chip tone={sm.tone}>
          <span
            className={cn(
              "inline-block h-1 w-1 rounded-full",
              sm.tone === "ok" && "bg-ok",
              sm.tone === "warn" && "bg-warn",
              sm.tone === "bad" && "bg-bad",
              sm.tone === "accent" && "bg-accent",
            )}
          />
          {sm.label}
        </Chip>
      </div>
      <div className="mt-1.5 text-caption leading-snug text-foreground-dim">{pipeline.desc}</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {pipeline.phases.map((ph, i) => (
          <Fragment key={`${ph.agent}-${i}`}>
            <span className="inline-flex items-center gap-1 font-mono text-xs text-foreground-dim">
              <Icon name={glyphForAgent(ph.agent, agents)} size="xs" className="text-accent" />
              {ph.agent}
            </span>
            {i < pipeline.phases.length - 1 && (
              <Icon name="arrow" size="xs" className="text-foreground-faint" />
            )}
          </Fragment>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span className="inline-flex items-center gap-1 font-mono text-xs text-foreground-faint">
          <Icon name="dollar" size="xs" className="text-foreground-faint" /> strop ${pipeline.budget}
        </span>
        <span className="font-mono text-xs text-foreground-faint">poslední {pipeline.lastRun}</span>
      </div>
    </button>
  )
}
