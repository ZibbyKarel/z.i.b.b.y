import { Fragment } from "react";
import { cn, Icon, Chip } from "@zibby/design-system";
import { glyphForAgent, type AgentDef, type Pipeline, type PipelinePhase } from "../../../domain";

const modelTone = {
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
} as const;

const thinkTone = {
  high: "think-high",
  medium: "think-medium",
  low: "think-low",
} as const;

/** Per-run model badge (opus / sonnet / haiku). */
export function ModelBadge({ model }: { model: PipelinePhase["model"] }) {
  return (
    <Chip tone={modelTone[model]} title="model (override per-run)">
      {model}
    </Chip>
  );
}

/** Thinking-level badge (high / medium / low). */
export function ThinkBadge({ level }: { level: PipelinePhase["thinking"] }) {
  return (
    <Chip tone={thinkTone[level]} title="thinking level">
      ◇ {level}
    </Chip>
  );
}

function PhaseNode({ phase, agents, idx, active }: { phase: PipelinePhase; agents: AgentDef[]; idx: number; active: boolean }) {
  return (
    <div
      className={cn(
        "relative min-w-0 flex-1 rounded border p-3",
        active ? "border-accent bg-raised" : "border-border bg-elevated",
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-sm border border-accent/30 bg-accent-dim text-accent">
          <Icon name={glyphForAgent(phase.agent, agents)} size="md" />
        </div>
        <div className="min-w-0">
          <span className="font-mono text-2xs tracking-wider text-foreground-faint">FÁZE {idx + 1}</span>
          <div className="whitespace-nowrap font-mono text-base font-semibold text-foreground">{phase.agent}</div>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ModelBadge model={phase.model} />
        <ThinkBadge level={phase.thinking} />
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5 border-t border-border pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[30px] shrink-0 font-mono text-2xs text-foreground-faint">vstup</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground-dim">{phase.consumes}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="w-[30px] shrink-0 font-mono text-2xs text-foreground-faint">výstup</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-accent">{phase.produces}</span>
        </div>
      </div>
    </div>
  );
}

export interface PhaseChainProps {
  pipeline: Pipeline;
  agents: AgentDef[];
  className?: string;
}

export function PhaseChain({ pipeline, agents, className }: PhaseChainProps) {
  const { phases } = pipeline;
  const loopPhase = phases.find((p) => p.loop);

  return (
    <div className={className}>
      {loopPhase?.loop && (
        <div className="relative h-[34px]">
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <path d="M62 30 C 62 6, 37 6, 37 30" fill="none" stroke="#ff6b6b" strokeWidth="1.2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <path d="M37 30 l 2.6 -5 l -5.2 0 z" fill="#ff6b6b" />
          </svg>
          <div className="absolute left-[49.5%] top-0 flex -translate-x-1/2 items-center gap-1.5">
            <Icon name="retry" size="xs" className="text-bad" />
            <span className="font-mono text-xs text-bad">retry · max {loopPhase.loop.maxRetries}</span>
          </div>
        </div>
      )}
      <div className="flex items-stretch gap-0.5">
        {phases.map((ph, i) => (
          <Fragment key={`${ph.agent}-${i}`}>
            <PhaseNode phase={ph} agents={agents} idx={i} active={Boolean(ph.loop)} />
            {i < phases.length - 1 && (
              <div className="flex shrink-0 flex-col items-center justify-center self-center px-1">
                <span className="mb-1 whitespace-nowrap font-mono text-2xs text-foreground-faint">{phases[i + 1]!.consumes}</span>
                <Icon name="arrow" size="md" className="text-foreground-faint" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
