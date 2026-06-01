import {
  cn,
  Button,
  Corners,
  Icon,
  ModelBadge,
  ThinkBadge,
  Pill,
  type AgentDef,
} from "@zibby/design-system";

export interface AgentCardProps {
  agent: AgentDef;
  onEdit?: (agent: AgentDef) => void;
  className?: string;
}

export function AgentCard({ agent, onEdit, className }: AgentCardProps) {
  return (
    <div
      className={cn(
        "group relative rounded-sm border border-border bg-panel p-3.5 transition-all hover:border-accent/35 hover:bg-panel-hi",
        className,
      )}
    >
      <Corners inset={5} />
      <div className="flex items-start gap-3">
        <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm border border-accent/20 bg-accent-dim text-accent">
          <Icon name={agent.glyph} size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-md font-semibold text-foreground">
            {agent.name}
          </div>
          <div className="mt-0.5 text-caption leading-snug text-foreground-dim">
            {agent.role}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <ModelBadge model={agent.model} />
        <ThinkBadge level={agent.thinking} />
        {agent.tools.slice(0, 4).map((t) => (
          <Pill key={t} tone="neutral">{t}</Pill>
        ))}
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3">
        <span className="max-w-[150px] truncate font-mono text-xs text-foreground-faint">
          {agent.file}
        </span>
        <Button intent="ghost" icon="edit" size="sm" onClick={() => onEdit?.(agent)}>
          Edit raw .agent.md
        </Button>
      </div>
    </div>
  );
}
