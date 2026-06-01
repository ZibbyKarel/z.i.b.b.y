import { cn, Button, Corners, Icon } from "@zibby/design-system";
import type { IconName } from "@zibby/design-system";

export interface EmptyStateProps {
  glyph: IconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  hint?: string;
  className?: string;
}

export function EmptyState({
  glyph,
  title,
  description,
  actionLabel,
  onAction,
  hint,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-3.5 border border-dashed border-border bg-[rgba(13,17,23,0.5)] px-6 py-12 text-center",
        className,
      )}
    >
      <Corners inset="75" />
      <div className="grid h-14 w-14 place-items-center rounded border border-accent/35 bg-accent-dim text-accent">
        <Icon name={glyph} size="xl" />
      </div>
      <div className="text-3xl font-semibold">{title}</div>
      <p className="max-w-md font-mono text-base leading-relaxed text-foreground-dim">
        {description}
      </p>
      {actionLabel && (
        <div className="mt-1">
          <Button intent="run" icon="plus" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
      {hint && (
        <span className="mt-1 font-mono text-sm tracking-wider text-foreground-faint">
          {hint}
        </span>
      )}
    </div>
  );
}
