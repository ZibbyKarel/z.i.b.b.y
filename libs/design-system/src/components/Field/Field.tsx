import { type ReactNode, type Ref, useId } from "react";
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
  hint?: string;
  /** When present, replaces the hint and marks the control invalid. */
  error?: string;
  layout?: FieldLayout;
  /** Render the control, wired with the ids/aria handed down. */
  children: (control: FieldControl) => ReactNode;
  ref?: Ref<HTMLElement>;
}

const labelClass =
  "font-mono text-sm uppercase tracking-wider text-foreground-faint";
const hintClass = "font-mono text-xs text-foreground-faint";
const errorClass = "font-mono text-xs text-bad";

/** Shared control chrome for the text-like inputs (`TextInput`, `TextArea`, `Select`). */
export const fieldControlClass =
  "w-full rounded border border-border bg-background px-3.5 py-2.5 font-sans text-md " +
  "text-foreground outline-none transition-colors placeholder:text-foreground-faint " +
  "focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent " +
  'aria-[invalid="true"]:border-bad aria-[invalid="true"]:focus-visible:ring-bad';

/**
 * Generic form-field wrapper. Owns the parts every control shares — label, hint,
 * error message, the id/aria plumbing — and lays them out per `layout`. The
 * concrete control is supplied as a render function so `Field` can hand it the
 * `id`, `labelId`, `describedBy` and `invalid` it needs to stay accessible.
 */
export function Field({
  label,
  hint,
  error,
  layout = "column",
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

  const labelEl = (
    <label
      className={labelClass}
      data-testid={FieldTestId.Label}
      htmlFor={id}
      id={labelId}
    >
      {label}
    </label>
  );

  const messageEl = error ? (
    <span
      className={errorClass}
      data-testid={FieldTestId.Error}
      id={messageId}
      role="alert"
    >
      {error}
    </span>
  ) : hint ? (
    <span className={hintClass} data-testid={FieldTestId.Hint} id={messageId}>
      {hint}
    </span>
  ) : null;

  if (layout === "row") {
    return (
      <Stack
        align="start"
        data-testid={FieldTestId.Root}
        direction="row"
        gap="150"
        ref={ref}
      >
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
