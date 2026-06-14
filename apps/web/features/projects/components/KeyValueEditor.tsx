"use client";

import { Button, Stack, TextInputField } from "@zibby/design-system";

/** A single editable key/value row (kept ordered + stable in the parent's state). */
export interface KeyValueRow {
  key: string;
  value: string;
}

export interface KeyValueEditorProps {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  /** Test id prefix for the rows (e.g. "project-env" → `project-env-key-0`). */
  testIdPrefix: string;
  /** Accessible label for the key column (shown only on the first row). */
  keyLabel: string;
  /** Accessible label for the value column (shown only on the first row). */
  valueLabel: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel: string;
  removeLabel: string;
  /** Mask the value input (secrets). */
  secret?: boolean;
}

/**
 * A small ordered key/value list editor composed entirely from DS primitives. The
 * rows are fully controlled by the parent (so env lives on the project entity and
 * secrets in a transient form); blank rows are the parent's to filter on submit.
 */
export function KeyValueEditor({
  rows,
  onChange,
  testIdPrefix,
  keyLabel,
  valueLabel,
  keyPlaceholder,
  valuePlaceholder,
  addLabel,
  removeLabel,
  secret,
}: KeyValueEditorProps) {
  const setRow = (index: number, patch: Partial<KeyValueRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const addRow = () => onChange([...rows, { key: "", value: "" }]);

  return (
    <Stack gap="100">
      {rows.map((row, i) => (
        <Stack align="end" direction="row" gap="100" key={i}>
          <TextInputField
            data-testid={`${testIdPrefix}-key-${i}`}
            label={keyLabel}
            onChange={(e) => setRow(i, { key: e.target.value })}
            placeholder={keyPlaceholder}
            value={row.key}
          />
          <TextInputField
            autoComplete="off"
            data-testid={`${testIdPrefix}-value-${i}`}
            label={valueLabel}
            onChange={(e) => setRow(i, { value: e.target.value })}
            placeholder={valuePlaceholder}
            type={secret ? "password" : "text"}
            value={row.value}
          />
          <Button
            aria-label={removeLabel}
            icon="x"
            intent="ghost"
            onClick={() => removeRow(i)}
            size="sm"
          />
        </Stack>
      ))}
      <Stack align="start" direction="row">
        <Button
          data-testid={`${testIdPrefix}-add`}
          icon="plus"
          intent="ghost"
          onClick={addRow}
          size="sm"
        >
          {addLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
