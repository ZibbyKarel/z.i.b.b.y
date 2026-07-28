"use client";

import type { LevelMappingKind, LevelMappingTarget } from "@zibby/contracts";
import {
  Button,
  Container,
  Dropdown,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
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

/** Width of the trailing remove-button column — keeps the header row's spacer
 * lined up with the `Button size="sm"` it sits above. */
const REMOVE_COLUMN_WIDTH = "30px";

/** Test-id suffixes, indexed per row: `level-mapping-<kind>-<part>-<i>` (`-add` has no index). */
export enum LevelMappingTableTestId {
  Level = "level",
  Target = "target",
  Remove = "remove",
  Add = "add",
  HeaderLevel = "header-level",
  HeaderTarget = "header-target",
}

/**
 * The editable external-level -> epic/task/ignore rows for ONE kind (Jira or GitHub),
 * composed from DS primitives the same way `KeyValueEditor`/`PersonRow` are — there is
 * no DS `Table`. A trailing ghost "+" row appends a blank entry defaulted to `task`
 * (mirrors the sync's own `ensureLevels` default), so a first-time external level looks
 * exactly like what the sync would have appended.
 *
 * The column labels ("Externí úroveň" / "Cíl") render ONCE as a header row instead of
 * repeating on every row (six rows used to read as six stacked forms). Each row's own
 * control keeps a real, accessible name — the text input via `TextInputField`'s
 * `hideLabel` (a visually-hidden, still-associated `<label>`), the target picker via a
 * bare `Dropdown` + `aria-label` (the same "non-labelable control names itself
 * directly" pattern `SelectField`'s own multi-select branch uses) — so nothing here
 * regresses to an unlabeled control, only to a non-repeating one.
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
      {rows.length > 0 && (
        <Stack aria-hidden align="center" direction="row" gap="100">
          <Container grow minW0>
            <Typography
              data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.HeaderLevel}`}
              type="label"
            >
              {t("level")}
            </Typography>
          </Container>
          <Container grow minW0>
            <Typography
              data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.HeaderTarget}`}
              type="label"
            >
              {t("target.label")}
            </Typography>
          </Container>
          <Container shrink={false} width={REMOVE_COLUMN_WIDTH} />
        </Stack>
      )}
      {rows.map((row, i) => (
        <Stack align="center" direction="row" gap="100" key={i}>
          <Container grow minW0>
            <TextInputField
              hideLabel
              data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.Level}-${i}`}
              label={t("level")}
              onChange={(e) => setRow(i, { externalLevel: e.target.value })}
              placeholder={t("levelPlaceholder")}
              value={row.externalLevel}
            />
          </Container>
          <Container grow minW0>
            <div data-testid={`level-mapping-${kind}-${LevelMappingTableTestId.Target}-${i}`}>
              <Dropdown<LevelMappingTarget>
                aria-label={t("target.label")}
                onChange={(target) => setRow(i, { target })}
                options={targetOptions}
                value={row.target}
                variant="field"
              />
            </div>
          </Container>
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
