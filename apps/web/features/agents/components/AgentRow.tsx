import {
  cn,
  Icon,
  Progress,
  StatusDot,
  type RunningAgent,
} from "@zibby/design-system";

export interface AgentRowProps {
  agent: RunningAgent;
  onStop?: (agent: RunningAgent) => void;
  className?: string;
}

export function AgentRow({ agent, onStop, className }: AgentRowProps) {
  const tone = agent.ctx === "work" ? "work" : "home";
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border py-3 last:border-b-0",
        className,
      )}
    >
      <StatusDot tone={tone} pulse />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 overflow-hidden whitespace-nowrap">
          <span className="shrink-0 font-mono text-base font-semibold text-foreground">
            {agent.skill}
          </span>
          <span className="truncate font-mono text-sm text-foreground-faint">
            · {agent.project}
          </span>
        </div>
        <div className="mt-0.5 truncate text-caption text-foreground-dim">{agent.prompt}</div>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex-1">
            <Progress value={agent.pct} tone="accent" height="50" glow label={`postup ${agent.skill}`} />
          </div>
          <span className="font-mono text-sm font-semibold text-accent">{agent.pct}%</span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Zastavit ${agent.skill}`}
        onClick={() => onStop?.(agent)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name="stop" size="xs" />
      </button>
    </div>
  );
}
