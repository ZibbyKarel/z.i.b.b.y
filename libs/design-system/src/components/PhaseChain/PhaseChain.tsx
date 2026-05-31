import { Fragment } from "react"
import { cn } from "../../lib/cn"
import {
  type AgentDef,
  glyphForAgent,
  type Pipeline,
  type PipelinePhase,
} from "../../domain"
import { Icon } from "../Icon/Icon"
import { Pill } from "../Pill/Pill"

const modelTone = {
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
} as const

const thinkTone = {
  high: "think-high",
  medium: "think-medium",
  low: "think-low",
} as const

export function ModelBadge({ model }: { model: PipelinePhase["model"] }) {
  return (
    <Pill tone={modelTone[model]} title="model (override per-run)">
      {model}
    </Pill>
  )
}

export function ThinkBadge({ level }: { level: PipelinePhase["thinking"] }) {
  return (
    <Pill tone={thinkTone[level]} title="thinking level">
      ◇ {level}
    </Pill>
  )
}

function PhaseNode({
  phase,
  agents,
  idx,
  active,
}: {
  phase: PipelinePhase
  agents: AgentDef[]
  idx: number
  active: boolean
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 rounded border p-3",
        active
          ? "border-accent bg-panel-hi shadow-[0_0_0_1px_var(--zb-accent-dim),0_0_22px_var(--zb-accent-dim)]"
          : "border-border bg-panel",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-sm border border-accent/30 bg-accent-dim text-accent">
          <Icon name={glyphForAgent(phase.agent, agents)} size={16} />
        </div>
        <div className="min-w-0">
          <span className="font-mono text-2xs tracking-wider text-foreground-faint">
            FÁZE {idx + 1}
          </span>
          <div className="whitespace-nowrap font-mono text-base font-semibold text-foreground">
            {phase.agent}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ModelBadge model={phase.model} />
        <ThinkBadge level={phase.thinking} />
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[30px] shrink-0 font-mono text-2xs text-foreground-faint">vstup</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-dim">
            {phase.consumes}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[30px] shrink-0 font-mono text-2xs text-foreground-faint">výstup</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-accent">
            {phase.produces}
          </span>
        </div>
      </div>
    </div>
  )
}

function Edge({ file }: { file: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center self-center px-1">
      <span className="mb-1 whitespace-nowrap font-mono text-2xs text-foreground-faint">
        {file}
      </span>
      <Icon name="arrow" size={16} className="text-foreground-faint" />
    </div>
  )
}

export interface PhaseChainProps {
  pipeline: Pipeline
  /** Agent registry, used to resolve glyphs per phase. */
  agents: AgentDef[]
  className?: string
}

/**
 * The orchestration heart: a visual chain of agent phases (handoff = file),
 * with the Tester's red dashed retry loop arc and pass / fail decision nodes.
 */
export function PhaseChain({ pipeline, agents, className }: PhaseChainProps) {
  const { phases } = pipeline
  const loopPhase = phases.find((p) => p.loop)

  return (
    <div className={className}>
      {loopPhase?.loop && (
        <div className="relative h-[34px]">
          <svg
            viewBox="0 0 100 34"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <path
              d="M62 30 C 62 6, 37 6, 37 30"
              fill="none"
              stroke="#ff6b6b"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            <path d="M37 30 l 2.6 -5 l -5.2 0 z" fill="#ff6b6b" />
          </svg>
          <div className="absolute left-[49.5%] top-0 flex -translate-x-1/2 items-center gap-1.5">
            <Icon name="retry" size={12} className="text-bad" />
            <span className="font-mono text-xs text-bad">
              retry · max {loopPhase.loop.maxRetries}
              {loopPhase.loop.escalate ? " · ↑ thinking" : ""}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-stretch gap-0.5">
        {phases.map((ph, i) => (
          <Fragment key={`${ph.agent}-${i}`}>
            <PhaseNode phase={ph} agents={agents} idx={i} active={Boolean(ph.loop)} />
            {i < phases.length - 1 && <Edge file={phases[i + 1]!.consumes} />}
          </Fragment>
        ))}
      </div>

      {loopPhase?.loop && (
        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <div className="flex flex-1 basis-[220px] items-center gap-2.5 rounded border border-ok/40 bg-ok/[0.07] px-3 py-2.5">
            <Icon name="check" size={15} stroke={2.2} className="text-ok" />
            <div>
              <span className="font-mono text-caption font-semibold text-ok">testy prošly</span>
              <span className="mt-0.5 block font-mono text-sm text-foreground-dim">
                → pokračuje na Dokumentátor
              </span>
            </div>
          </div>
          <div className="flex flex-1 basis-[220px] items-center gap-2.5 rounded border border-bad/40 bg-bad/[0.07] px-3 py-2.5">
            <Icon name="retry" size={15} className="text-bad" />
            <div>
              <span className="font-mono text-caption font-semibold text-bad">testy selhaly</span>
              <span className="mt-0.5 block font-mono text-sm text-foreground-dim">
                → zpět na {loopPhase.loop.to} · po {loopPhase.loop.maxRetries} pokusech → park na review
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
