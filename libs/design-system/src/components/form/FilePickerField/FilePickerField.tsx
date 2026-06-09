"use client";

import { type InputHTMLAttributes, type Ref, useRef, useState } from "react";
import { cn } from "../../../utils/cn";
import { Icon } from "../../Icon/Icon";
import { Field } from "../Field";

export enum FilePickerFieldTestId {
  Control = "file-picker-field-control",
  Display = "file-picker-field-display",
  Input = "file-picker-field-input",
  Trigger = "file-picker-field-trigger",
}

export interface FilePickerFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "className" | "type"
> {
  label: string;
  hint?: string;
  error?: string;
  /**
   * Enables folder selection via `webkitdirectory`. When true the user picks an
   * entire directory; all files inside are still passed to `onChange` (the
   * browser exposes no other handle), but the control presents as a directory
   * picker — the display shows the picked folder's name, not a file count.
   */
  directory?: boolean;
  /** Text shown when no file is selected. */
  placeholder?: string;
  ref?: Ref<HTMLInputElement>;
}

export function FilePickerField({
  label,
  hint,
  error,
  directory = false,
  multiple,
  placeholder = "Žádný soubor vybrán",
  onChange,
  ref,
  ...props
}: FilePickerFieldProps) {
  const [display, setDisplay] = useState<string | null>(null);
  const ownRef = useRef<HTMLInputElement>(null);

  function assignRef(el: HTMLInputElement | null) {
    (ownRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    if (el && directory) {
      // webkitdirectory is not in @types/react; set it imperatively
      el.setAttribute("webkitdirectory", "");
    }
    if (typeof ref === "function") {
      ref(el);
    } else if (ref) {
      (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) {
      setDisplay(null);
    } else if (directory) {
      // A directory pick is a single target: show the folder name (the first
      // segment of `webkitRelativePath`), never the per-file count.
      const rel = files[0]?.webkitRelativePath;
      setDisplay(rel?.split("/")[0] ?? files[0]?.name ?? null);
    } else if (files.length === 1) {
      setDisplay(files[0]?.name ?? null);
    } else {
      setDisplay(`${files.length} souborů vybráno`);
    }
    onChange?.(e);
  }

  return (
    <Field error={error} hint={hint} label={label}>
      {({ id, describedBy, invalid }) => (
        <div
          className={cn(
            "flex w-full items-center overflow-hidden rounded border border-border bg-background transition-colors",
            "focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent",
            invalid && "border-bad focus-within:ring-bad",
          )}
          data-testid={FilePickerFieldTestId.Control}
        >
          <input
            {...props}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="sr-only"
            data-testid={FilePickerFieldTestId.Input}
            id={id}
            multiple={multiple}
            onChange={handleChange}
            ref={assignRef}
            tabIndex={-1}
            type="file"
          />
          <span
            className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2.5 font-sans text-md"
            data-testid={FilePickerFieldTestId.Display}
          >
            <Icon
              aria-hidden
              name="file"
              size="sm"
              stroke="default"
              tone="faint"
            />
            <span
              className={cn(
                "truncate",
                display ? "text-foreground" : "text-foreground-faint",
              )}
            >
              {display ?? placeholder}
            </span>
          </span>
          <button
            aria-label="Procházet soubory"
            className={
              "shrink-0 cursor-pointer self-stretch border-l border-border px-3.5 " +
              "bg-transparent font-mono text-sm font-semibold text-accent transition-colors " +
              "hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 " +
              "focus-visible:ring-inset focus-visible:ring-accent"
            }
            data-testid={FilePickerFieldTestId.Trigger}
            onClick={() => ownRef.current?.click()}
            type="button"
          >
            Procházet
          </button>
        </div>
      )}
    </Field>
  );
}
