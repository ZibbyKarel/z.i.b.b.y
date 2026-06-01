import { cn } from "../../utils/cn";
import { Stack } from "../Stack/Stack";
import { Icon } from "../Icon/Icon";

export enum ButtonGroupTestId {
  Root = "button-group-root",
  /** Each option button is suffixed with its `id`, e.g. `button-group-option-home`. */
  Option = "button-group-option",
  Add = "button-group-add",
}

export type ButtonGroupTone = "home" | "work" | "accent";

const toneSwatch: Record<ButtonGroupTone, string> = {
  home: "bg-home",
  work: "bg-work",
  accent: "bg-accent",
};

const toneActive: Record<ButtonGroupTone, string> = {
  home: "bg-home text-background shadow-[0_0_14px_rgba(240,180,41,0.33)]",
  work: "bg-work text-background shadow-[0_0_14px_rgba(91,141,239,0.33)]",
  accent: "bg-accent text-accent-contrast",
};

export interface ButtonGroupOption {
  id: string;
  label: string;
  /** Semantic colour for the swatch + active state, resolved inside the DS. */
  tone?: ButtonGroupTone;
}

export interface ButtonGroupProps {
  options: ButtonGroupOption[];
  value: string;
  onChange: (value: string) => void;
  onAdd?: () => void;
  /** Accessible label for the add-option affordance. */
  addLabel?: string;
  /** Accessible label for the group element. */
  ariaLabel?: string;
}

/** Generic segmented button group — a row of mutually exclusive toggle buttons. */
export function ButtonGroup({
  options,
  value,
  onChange,
  onAdd,
  addLabel = "Přidat",
  ariaLabel,
}: ButtonGroupProps) {
  return (
    <div
      data-testid={ButtonGroupTestId.Root}
      role="group"
      aria-label={ariaLabel}
      className="inline-block rounded border border-border bg-background p-0.5"
    >
      <Stack direction="row" inline align="center" gap="25">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            data-testid={`${ButtonGroupTestId.Option}-${o.id}`}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-sm border-none px-3 py-1.5 font-mono text-base font-semibold transition-all",
              "outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active
                ? (o.tone ? toneActive[o.tone] : "bg-accent text-accent-contrast")
                : "bg-transparent text-foreground-dim hover:text-foreground",
            )}
          >
            {o.tone && (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  active ? "bg-background opacity-70" : toneSwatch[o.tone],
                )}
              />
            )}
            {o.label}
          </button>
        );
      })}
      {onAdd && (
        <button
          data-testid={ButtonGroupTestId.Add}
          type="button"
          aria-label={addLabel}
          onClick={onAdd}
          className="flex px-2 py-1.5 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Icon name="plus" size="sm" />
        </button>
      )}
      </Stack>
    </div>
  );
}
