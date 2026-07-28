"use client";

import type { LevelMappingKind, LevelMappingTarget } from "@zibby/contracts";
import { Button, SelectField, Stack, TextInputField } from "@zibby/design-system";
import { useTranslations } from "next-intl";

/** One editable row: the raw external level plus what it resolves to. */
export interface LevelMappingTableRow {
  externalLevel: string;
  target: LevelMappingTarget;
}

export interface LevelMappingTableProps {
  /** Which source kind this table edits — only used to namespace test ids
   * (`level-mapping-<kind>-...`); the rows themselves are already the
   * kind-filtered subset the parent hands down. */
  kind: LevelMappingKind;
  rows: LevelMappingTableRow[];
  onChange: (rows: LevelMappingTableRow[]) => void;
}

const TARGETS: LevelMappingTarget[] = ["epic", "task", "ignore"];

/** Test-id suffixes, indexed per row: `level-mapping-<kind>-<part>-<i>` (`-add` has no index). */
export enum LevelMappingTableTestId {
  Level = "level",
  Target = "target",
  Remove = "remove",
  Add = "add",
}

/**
 * The editable external-level -> epic/task/ignore rows for ONE kind (Jira or GitHub),
 * composed from DS primitives the same way `KeyValueEditor`/`PersonRow` are — there is
 * no DS `Table`. A trailing ghost "+" row appends a blank entry defaulted to `task`
 * (mirrors the sync's own `ensureLevels` default), so a first-time external level looks
 * exactly like what the sync would have appended.
 */
export function LevelMappingTable({ kind, rows, onChange }: LevelMappingTableProps) {
  const t = useTranslations("settings.tasks");

  const targetOptions = TARGETS.map((target) => ({
    value: target,
    label: t(`target.${target}`),
  }));

  const setRow = (index: number, patch: Partial<LevelMappingTableRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index));

  const addRow = () => onChange([...rows, { externalLevel: "", target: "task" }]);

  return (
    <Stack gap="100">
      {rows.map((row, i) => (
        <Stack align="end" direction="row" gap="100" key={i}>
          <TextInputField
            data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.Level}-${i}`}
            label={t("level")}
            onChange={(e) => setRow(i, { externalLevel: e.target.value })}
            placeholder={t("levelPlaceholder")}
            value={row.externalLevel}
          />
          <div data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.Target}-${i}`}>
            <SelectField
              label={t("target.label")}
              onValueChange={(value) => setRow(i, { target: value })}
              options={targetOptions}
              value={row.target}
            />
          </div>
          <Button
            aria-label={t("remove")}
            data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.Remove}-${i}`}
            icon="x"
            intent="ghost"
            onClick={() => removeRow(i)}
            size="sm"
          />
        </Stack>
      ))}
      <Stack align="start" direction="row">
        <Button
          data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.Add}`}
          icon="plus"
          intent="ghost"
          onClick={addRow}
          size="sm"
        >
          {t("add")}
        </Button>
      </Stack>
    </Stack>
  );
}
