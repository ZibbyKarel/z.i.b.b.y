import { cn } from "../../lib/cn";
import type { ContextName } from "../../DesignSystemContext/contextTokens";
import { Icon } from "../Icon/Icon";

interface ContextOption {
  id: ContextName;
  label: string;
  /** Solid swatch color for the active state. */
  swatch: string;
  active: string;
  glow: string;
}

const OPTIONS: ContextOption[] = [
  {
    id: "home",
    label: "home",
    swatch: "bg-home",
    active: "bg-home text-surface-0 shadow-[0_0_14px_rgba(240,180,41,0.33)]",
    glow: "",
  },
  {
    id: "work",
    label: "work",
    swatch: "bg-work",
    active: "bg-work text-surface-0 shadow-[0_0_14px_rgba(91,141,239,0.33)]",
    glow: "",
  },
];

export interface ContextSwitchProps {
  context: ContextName;
  onContextChange: (context: ContextName) => void;
  /** Invoked when the "+" (add context) affordance is pressed. */
  onAddContext?: () => void;
  className?: string;
}

/**
 * Segmented control between `home` (amber) and `work` (blue) contexts —
 * the dashboard's top-bar context switch.
 */
export function ContextSwitch({
  context,
  onContextChange,
  onAddContext,
  className,
}: ContextSwitchProps) {
  return (
    <div
      role="group"
      aria-label="Přepínač kontextu"
      className={cn(
        "inline-flex items-center gap-0.5 rounded border border-border bg-surface-0 p-0.5",
        className,
      )}
    >
      {OPTIONS.map((o) => {
        const on = context === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onContextChange(o.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border-none px-3 py-1.5 font-mono text-base font-semibold transition-all",
              "outline-none focus-visible:ring-2 focus-visible:ring-accent",
              on
                ? o.active
                : "bg-transparent text-foreground-dim hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                on ? "bg-surface-0 opacity-70" : o.swatch,
              )}
            />
            {o.label}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Přidat kontext"
        onClick={onAddContext}
        className="flex px-2 py-1.5 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name="plus" size={13} />
      </button>
    </div>
  );
}
