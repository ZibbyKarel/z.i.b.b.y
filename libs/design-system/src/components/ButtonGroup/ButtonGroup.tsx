import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Icon } from "../Icon/Icon";

export enum ButtonGroupTestId {
  Root = "button-group-root",
  /** Each option button is suffixed with its `id`, e.g. `button-group-option-home`. */
  Option = "button-group-option",
  /** Leading slot of an option, suffixed with its `id`, e.g. `button-group-leading-home`. */
  Leading = "button-group-leading",
  /** Trailing slot of an option, suffixed with its `id`, e.g. `button-group-trailing-home`. */
  Trailing = "button-group-trailing",
  Add = "button-group-add",
}

export type ButtonGroupTone = "accent" | "ok" | "warn" | "bad";

const toneSwatch: Record<ButtonGroupTone, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

export interface ButtonGroupOption {
  id: string;
  label: string;
  /** Semantic colour for the swatch dot, resolved inside the DS. The selected item
   *  is always ink/panel (DS.md segmented control) — status hue stays on the dot. */
  tone?: ButtonGroupTone;
  /** Arbitrary content rendered before the label (icon, status dot, …). */
  leading?: ReactNode;
  /** Arbitrary content rendered after the label (count, badge, …). */
  trailing?: ReactNode;
}

export interface ButtonGroupBaseProps {
  options: ButtonGroupOption[];
  onAdd?: () => void;
  /** Accessible label for the add-option affordance. */
  addLabel?: string;
  /** Accessible label for the group element. */
  ariaLabel?: string;
  /** Id of an external label element — wins over `ariaLabel` (e.g. a `Field` label). */
  ariaLabelledby?: string;
  /** Id of an external description/error element (e.g. a `Field` message). */
  ariaDescribedby?: string;
}

export type ButtonGroupProps = ButtonGroupBaseProps &
  (
    | {
        multiple?: false;
        /** The active option `id`, or `""` for no selection. */
        value: string;
        /** Fires with the clicked option `id`, or `""` when the active option is
         *  toggled off (only possible when `deselectable`). */
        onChange: (value: string) => void;
        /** Allow clicking the active option to clear the selection (emits `""`). */
        deselectable?: boolean;
      }
    | {
        multiple: true;
        /** Selected option ids; empty = nothing selected. */
        value: readonly string[];
        /** Fires with the new selected ids (in `options` order) after a toggle. */
        onChange: (value: string[]) => void;
      }
  );

/** Generic segmented button group — mutually exclusive toggle buttons, or a multiselect with `multiple`. */
export function ButtonGroup({
  options,
  onAdd,
  addLabel = "Přidat",
  ariaLabel,
  ariaLabelledby,
  ariaDescribedby,
  ...selection
}: ButtonGroupProps) {
  const isActive = (id: string) =>
    selection.multiple ? selection.value.includes(id) : selection.value === id;
  const select = (id: string, active: boolean) => {
    if (selection.multiple) {
      selection.onChange(
        options.map((o) => o.id).filter((x) => (x === id ? !active : selection.value.includes(x))),
      );
    } else {
      selection.onChange(selection.deselectable && active ? "" : id);
    }
  };
  return (
    <div
      aria-describedby={ariaDescribedby}
      aria-label={ariaLabelledby ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledby}
      className="inline-block h-8 w-fit max-w-full rounded-md border border-border-strong bg-background p-0.5"
      data-testid={ButtonGroupTestId.Root}
      role="group"
    >
      <div className="inline-flex h-full items-stretch gap-0.5">
        {options.map((o) => {
          const active = isActive(o.id);
          return (
            <button
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-2 rounded-sm border-none px-[10px] font-sans text-[12px] font-medium transition-all",
                focusRing,
                active
                  ? "bg-raised text-ink shadow-card"
                  : "bg-transparent text-foreground-faint hover:text-foreground",
              )}
              data-testid={`${ButtonGroupTestId.Option}-${o.id}`}
              key={o.id}
              onClick={() => select(o.id, active)}
              type="button"
            >
              {o.leading && (
                <span
                  className="inline-flex items-center"
                  data-testid={`${ButtonGroupTestId.Leading}-${o.id}`}
                >
                  {o.leading}
                </span>
              )}
              {o.tone && <span className={cn("h-1.5 w-1.5 rounded-full", toneSwatch[o.tone])} />}
              {o.label}
              {!!o.trailing && (
                <span
                  className="inline-flex items-center"
                  data-testid={`${ButtonGroupTestId.Trailing}-${o.id}`}
                >
                  {o.trailing}
                </span>
              )}
            </button>
          );
        })}
        {onAdd && (
          <button
            aria-label={addLabel}
            className={cn(
              "flex items-center rounded-sm px-2 text-foreground-faint hover:bg-hover hover:text-foreground",
              focusRing,
            )}
            data-testid={ButtonGroupTestId.Add}
            onClick={onAdd}
            type="button"
          >
            <Icon name="plus" size="sm" />
          </button>
        )}
      </div>
    </div>
  );
}
