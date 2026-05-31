import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from "react"
import { cn } from "../../lib/cn"

const labelClass =
  "font-mono text-sm uppercase tracking-wider text-foreground-faint"

const controlClass =
  "w-full rounded border border-border bg-surface-0 px-3.5 py-2.5 font-sans text-md " +
  "text-foreground outline-none transition-colors placeholder:text-foreground-faint " +
  "focus-visible:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent"

function FieldShell({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <span className="font-mono text-xs text-foreground-faint">{hint}</span>}
    </div>
  )
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string
  hint?: string
  ref?: React.Ref<HTMLInputElement>
}

/** Labelled single-line text input. */
export function TextField({ label, hint, className, ref, ...props }: TextFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input ref={ref} id={id} className={cn(controlClass, className)} {...props} />
    </FieldShell>
  )
}

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string
  hint?: string
  ref?: React.Ref<HTMLTextAreaElement>
}

/** Labelled multi-line text input. */
export function TextAreaField({
  label,
  hint,
  className,
  ref,
  ...props
}: TextAreaFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea
        ref={ref}
        id={id}
        className={cn(controlClass, "min-h-20 resize-y leading-relaxed", className)}
        {...props}
      />
    </FieldShell>
  )
}

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps {
  label: string
  hint?: string
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  className?: string
}

/** Labelled native select. */
export function SelectField({
  label,
  hint,
  value,
  options,
  onValueChange,
  className,
}: SelectFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <select
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(controlClass, "cursor-pointer appearance-none", className)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-0 text-foreground">
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export interface SegmentedFieldProps {
  label: string
  hint?: string
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
}

/** Labelled segmented chooser — a row of mutually exclusive chip buttons. */
export function SegmentedField({
  label,
  hint,
  value,
  options,
  onValueChange,
}: SegmentedFieldProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onValueChange(o.value)}
              className={cn(
                "rounded-sm border px-3 py-1.5 font-mono text-sm outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-accent",
                on
                  ? "border-accent bg-accent text-accent-contrast"
                  : "border-border bg-transparent text-foreground-dim hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </FieldShell>
  )
}
