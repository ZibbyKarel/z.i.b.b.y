import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cn } from "../../utils/cn";
import { Stack } from "../Stack/Stack";

export enum FieldTestId {
  Root = "field-root",
  Label = "field-label",
  Control = "field-control",
  Hint = "field-hint",
  Group = "field-group",
  /** Each segmented option button is suffixed with its `value`, e.g. `field-option-home`. */
  Option = "field-option",
}

const labelClass =
  "font-mono text-sm uppercase tracking-wider text-foreground-faint";

const controlClass =
  "w-full rounded border border-border bg-background px-3.5 py-2.5 font-sans text-md " +
  "text-foreground outline-none transition-colors placeholder:text-foreground-faint " +
  "focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent";

function FieldShell({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Stack data-testid={FieldTestId.Root} gap="100">
      <label className={labelClass} data-testid={FieldTestId.Label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && (
        <span className="font-mono text-xs text-foreground-faint" data-testid={FieldTestId.Hint}>{hint}</span>
      )}
    </Stack>
  );
}

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className"
> {
  label: string;
  hint?: string;
  ref?: React.Ref<HTMLInputElement>;
}

/** Labelled single-line text input. */
export function TextField({ label, hint, ref, ...props }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell hint={hint} id={id} label={label}>
      <input className={controlClass} data-testid={FieldTestId.Control} id={id} ref={ref} {...props} />
    </FieldShell>
  );
}

export interface TextAreaFieldProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "className"
> {
  label: string;
  hint?: string;
  ref?: React.Ref<HTMLTextAreaElement>;
}

/** Labelled multi-line text input. */
export function TextAreaField({
  label,
  hint,
  ref,
  ...props
}: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell hint={hint} id={id} label={label}>
      <textarea
        className={cn(controlClass, "min-h-20 resize-y leading-relaxed")}
        data-testid={FieldTestId.Control}
        id={id}
        ref={ref}
        {...props}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  hint?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
}

/** Labelled native select. */
export function SelectField({
  label,
  hint,
  value,
  options,
  onValueChange,
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell hint={hint} id={id} label={label}>
      <select
        className={cn(controlClass, "cursor-pointer appearance-none")}
        data-testid={FieldTestId.Control}
        id={id}
        onChange={(e) => onValueChange(e.target.value)}
        value={value}
      >
        {options.map((o) => (
          <option
            className="bg-background text-foreground"
            key={o.value}
            value={o.value}
          >
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export interface SegmentedFieldProps {
  label: string;
  hint?: string;
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
}

/** Labelled segmented chooser — a row of mutually exclusive chip buttons. */
export function SegmentedField({
  label,
  hint,
  value,
  options,
  onValueChange,
}: SegmentedFieldProps) {
  const id = useId();
  return (
    <FieldShell hint={hint} id={id} label={label}>
      <Stack
        wrap
        aria-label={label}
        data-testid={FieldTestId.Group}
        direction="row"
        gap="75"
        role="radiogroup"
      >
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              aria-checked={on}
              className={cn(
                "rounded-sm border px-3 py-1.5 font-mono text-sm outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-accent",
                on
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border bg-transparent text-foreground-dim hover:text-foreground",
              )}
              data-testid={`${FieldTestId.Option}-${o.value}`}
              key={o.value}
              onClick={() => onValueChange(o.value)}
              role="radio"
              type="button"
            >
              {o.label}
            </button>
          );
        })}
      </Stack>
    </FieldShell>
  );
}
