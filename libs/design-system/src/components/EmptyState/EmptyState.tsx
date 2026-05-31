import { cn } from "../../lib/cn";
import { Button } from "../Button/Button";
import { Corners } from "../HudPanel/HudPanel";
import { Icon, type IconName } from "../Icon/Icon";

export interface EmptyStateProps {
  glyph: IconName;
  title: string;
  description: string;
  /** Primary action label, e.g. "+ Přidat skill". */
  actionLabel?: string;
  onAction?: () => void;
  /** Mono footnote, e.g. the file/dir that will be created. */
  hint?: string;
  className?: string;
}

/**
 * The empty-dashboard placeholder: a calm HUD panel inviting the user to create the
 * first file (skill / integration / agent / pipeline). Files are the source of
 * truth, so "adding" always means writing a new file on disk.
 */
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
      <Corners inset={5} />
      <div className="grid h-14 w-14 place-items-center rounded border border-accent/35 bg-accent-dim text-accent">
        <Icon name={glyph} size={26} />
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
