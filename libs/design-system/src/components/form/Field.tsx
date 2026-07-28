import { type ReactNode, type Ref, useId } from "react";
import { focusRing } from "../../utils/focus";
import { cn } from "../../utils/cn";
import { Stack } from "../Stack/Stack";

export enum FieldTestId {
  Root = "field-root",
  Label = "field-label",
  Hint = "field-hint",
  Error = "field-error",
}

/** Stacking direction of label vs. control.
 * - `column` — label on top, control below, message under it (text-like inputs).
 * - `row` — control on the left, label + message to the right (toggle/checkbox). */
export type FieldLayout = "column" | "row";

/** A `{ value, label }` pair — shared by `Select` and `SegmentPicker`. */
export interface SelectOption {
  value: string;
  label: string;
}

/** Wiring handed from `Field` to the control it wraps. */
export interface FieldControl {
  /** Control id; also the label's `htmlFor` target. */
  id: string;
  /** Label element id — for `aria-labelledby` on non-labelable controls (groups, toggles). */
  labelId: string;
  /** Id of the visible message (error or hint), or `undefined` when none. */
  describedBy: string | undefined;
  /** `true` when an error message is shown. */
  invalid: boolean;
}

export interface FieldProps {
  label: string;
  /** Optional node rendered inline after the label — e.g. a help `Tooltip` trigger. */
  labelHint?: ReactNode;
  hint?: string;
  /** When present, replaces the hint and marks the control invalid. */
  error?: string;
  layout?: FieldLayout;
  /**
   * Visually hide the label (`sr-only`) while keeping the real, associated
   * `<label htmlFor>` in the DOM — the control still has a proper accessible
   * name, it just doesn't repeat visibly. For repeated rows of the same field
   * in a hand-rolled table (there is no DS `Table` — see `KeyValueEditor`/
   * `LevelMappingTable`), where a header row already shows the label once and
   * six stacked "forms" would otherwise read like six stacked labels.
   */
  hideLabel?: boolean;
  /** Render the control, wired with the ids/aria handed down. */
  children: (control: FieldControl) => ReactNode;
  ref?: Ref<HTMLElement>;
}

const labelClass = "font-mono text-sm uppercase tracking-wider text-foreground-faint";
const hintClass = "font-mono text-xs text-foreground-faint";
const errorClass = "font-mono text-xs text-bad";

/** Shared control chrome for the text-like inputs (`TextInput`, `TextArea`, `Select`). */
export const fieldControlClass =
  "w-full rounded border border-border bg-background px-3.5 py-2.5 font-sans text-md " +
  "text-foreground transition-colors placeholder:text-foreground-faint " +
  `${focusRing} focus-visible:border-accent/50 ` +
  'aria-[invalid="true"]:border-bad aria-[invalid="true"]:focus-visible:ring-bad';

/**
 * Generic form-field wrapper. Owns the parts every control shares — label, hint,
 * error message, the id/aria plumbing — and lays them out per `layout`. The
 * concrete control is supplied as a render function so `Field` can hand it the
 * `id`, `labelId`, `describedBy` and `invalid` it needs to stay accessible.
 */
export function Field({
  label,
  labelHint,
  hint,
  error,
  layout = "column",
  hideLabel = false,
  children,
  ref,
}: FieldProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const control = children({
    id,
    labelId,
    describedBy: message ? messageId : undefined,
    invalid: Boolean(error),
  });

  const labelText = (
    <label
      className={cn(labelClass, hideLabel && "sr-only")}
      data-testid={FieldTestId.Label}
      htmlFor={id}
      id={labelId}
    >
      {label}
    </label>
  );
  const labelEl = labelHint ? (
    <Stack align="center" direction="row" gap="75">
      {labelText}
      {labelHint}
    </Stack>
  ) : (
    labelText
  );

  const messageEl = error ? (
    <span className={errorClass} data-testid={FieldTestId.Error} id={messageId} role="alert">
      {error}
    </span>
  ) : hint ? (
    <span className={hintClass} data-testid={FieldTestId.Hint} id={messageId}>
      {hint}
    </span>
  ) : null;

  if (layout === "row") {
    return (
      <Stack align="start" data-testid={FieldTestId.Root} direction="row" gap="150" ref={ref}>
        {control}
        <Stack gap="50">
          {labelEl}
          {messageEl}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack data-testid={FieldTestId.Root} gap="100" ref={ref}>
      {labelEl}
      {control}
      {messageEl}
    </Stack>
  );
}
