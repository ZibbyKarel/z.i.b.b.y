import type { Ref } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";

/** The three gate dispositions a handoff rule can resolve to — DS.md §8's
 * `AUTO`/`ASK` pill, plus `silent` (act without surfacing at all). Shared by
 * {@link GateToggle} and `ChainRouteStrip`'s inline gate markers so both read
 * the same vocabulary. */
export type GateMode = "auto" | "ask" | "silent";

const GATE_MODES: GateMode[] = ["auto", "ask", "silent"];

const gateLabel: Record<GateMode, string> = {
  auto: "Auto",
  ask: "Ask",
  silent: "Silent",
};

export enum GateToggleTestId {
  Root = "gate-toggle-root",
  /** Each option button is suffixed with its mode, e.g. `gate-toggle-option-auto`. */
  Option = "gate-toggle-option",
}

export interface GateToggleProps {
  mode: GateMode;
  /** Omit to render a read-only display of the current mode (Task detail's
   *  resolved-from-handoff-rules annotation vs. the Chains editor's live control). */
  onChange?: (mode: GateMode) => void;
  /** Accessible label for the group. */
  ariaLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * DS.md §8's small `AUTO`⇄`ASK` pill — same visual read-only (Task detail, New
 * task preview) or editable (Chains editor, per-project rules). `silent` is a
 * third disposition (act without surfacing) some rules resolve to. Each option
 * is an independently-focusable toggle button (mirroring `ButtonGroup`'s
 * `aria-pressed` pattern), not a roving-tabindex radiogroup.
 */
export function GateToggle({ mode, onChange, ariaLabel = "Gate mode", ref }: GateToggleProps) {
  const readOnly = !onChange;
  return (
    <div
      aria-label={ariaLabel}
      className="inline-flex border border-border-strong"
      data-testid={GateToggleTestId.Root}
      ref={ref}
      role="group"
    >
      {GATE_MODES.map((m) => {
        const active = m === mode;
        return (
          <button
            aria-disabled={readOnly || undefined}
            aria-pressed={readOnly ? undefined : active}
            className={cn(
              "rounded-none border-none px-[10px] py-[5px] font-mono text-[10px] font-semibold tracking-wider uppercase transition-colors",
              !readOnly && focusRingInset,
              active ? "bg-ink text-panel" : "bg-transparent text-foreground-faint",
              !readOnly && !active && "cursor-pointer hover:text-foreground",
              readOnly && "cursor-default",
            )}
            data-testid={`${GateToggleTestId.Option}-${m}`}
            disabled={readOnly}
            key={m}
            onClick={() => onChange?.(m)}
            type="button"
          >
            {gateLabel[m]}
          </button>
        );
      })}
    </div>
  );
}
