"use client";

import type { ChainInput, DepartmentId } from "@zibby/contracts";
import { DEPARTMENTS } from "@zibby/contracts";
import {
  Button,
  Card,
  Container,
  GateToggle,
  IconTile,
  SelectField,
  Stack,
  TextAreaField,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";

/** A chain hop's gate — the two dispositions `ChainStepInputSchema` allows
 *  (O-05: a chain hop never resolves to `"silent"`, unlike a signal rule). */
type ChainGate = "auto" | "ask";

/** One editable stop on the route — the entry department (index 0, no incoming
 *  gate) or a step (its `gate` governs the hop INTO it). */
interface Stop {
  department: DepartmentId;
  gate: ChainGate;
}

const DEFAULT_DEPARTMENTS: readonly DepartmentId[] = ["dev", "qa"];

function defaultStops(): Stop[] {
  return DEFAULT_DEPARTMENTS.map((department) => ({ department, gate: "auto" as const }));
}

/** `Chain`/`ChainInput` → this editor's stop list (entry + every step's department/gate). */
function chainInputToStops(chain: Pick<ChainInput, "entry" | "steps">): Stop[] {
  return [
    { department: chain.entry, gate: "auto" },
    ...chain.steps.map((s) => ({ department: s.department, gate: s.gate })),
  ];
}

export interface ChainEditorProps {
  initial?: {
    label: string;
    description: string;
    entry: DepartmentId;
    steps: { department: DepartmentId; gate: ChainGate }[];
    enabled: boolean;
  };
  saving?: boolean;
  saveLabel: string;
  onCancel?: () => void;
  onSave: (input: ChainInput) => void;
}

/**
 * The step-cards editor shared by `/work/chains/[id]`'s edit mode and
 * `/work/chains/new`'s create page (PART-B ZB-05b): department `SelectField`
 * per stop, ← → reorder, ✕ remove, `+ ADD DEPARTMENT`, a `GateToggle` between
 * consecutive stops, and label/description fields. `enabled` isn't exposed as
 * its own control here (not in this deliverable's field list) — it's carried
 * through from `initial` unchanged (defaults to `true` for a new chain).
 *
 * `GateToggle` always renders its full auto/ask/silent vocabulary (it's shared
 * with the signal-rule editor, which does use `silent`); a chain hop clamps
 * a `"silent"` click back to `"auto"` rather than growing a chain-only variant
 * of the control (ponytail: `GateToggle` has no `options` prop to restrict its
 * choices — add one if a second gate-bearing editor needs the same clamp).
 */
export function ChainEditor({ initial, saving, saveLabel, onCancel, onSave }: ChainEditorProps) {
  const t = useTranslations("chainsWork");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [stops, setStops] = useState<Stop[]>(initial ? chainInputToStops(initial) : defaultStops());

  const canSave = label.trim().length > 0 && stops.length >= 2;

  function updateStop(index: number, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeStop(index: number) {
    if (stops.length <= 2) return;
    setStops((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStop(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stops.length) return;
    setStops((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  }

  function addStop() {
    const used = new Set(stops.map((s) => s.department));
    const next = DEPARTMENTS.find((d) => !used.has(d.id))?.id ?? DEPARTMENTS[0]!.id;
    setStops((prev) => [...prev, { department: next, gate: "auto" }]);
  }

  function save() {
    if (!canSave) return;
    const [entryStop, ...rest] = stops;
    if (!entryStop) return;
    onSave({
      label: label.trim(),
      description: description.trim(),
      entry: entryStop.department,
      steps: rest.map((s) => ({ department: s.department, gate: s.gate })),
      enabled: initial?.enabled ?? true,
    });
  }

  return (
    <Stack gap="250">
      <Stack gap="150">
        <TextInputField
          label={t("detail.labelField")}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("detail.labelPlaceholder")}
          value={label}
        />
        <TextAreaField
          label={t("detail.descriptionField")}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("detail.descriptionPlaceholder")}
          rows={2}
          value={description}
        />
      </Stack>

      <Stack gap="150">
        <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
          {t("detail.stepsHeader")}
        </Typography>
        {stops.map((stop, index) => (
          <Stack gap="75" key={index}>
            {index > 0 && (
              <Stack align="center" direction="row" gap="100">
                <GateToggle
                  ariaLabel={t("detail.gateAria", { n: index })}
                  mode={stop.gate}
                  onChange={(mode) => updateStop(index, { gate: mode === "ask" ? "ask" : "auto" })}
                />
              </Stack>
            )}
            <Card background="background" radius="default">
              <Container padding="150">
                <Stack align="center" direction="row" gap="150">
                  <IconTile glyph="compass" size="sm" />
                  <Container grow>
                    <SelectField
                      label={t("detail.stepDepartment", { n: index + 1 })}
                      onValueChange={(v) => updateStop(index, { department: v as DepartmentId })}
                      options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))}
                      value={stop.department}
                    />
                  </Container>
                  <Stack direction="row" gap="50">
                    <Button
                      aria-label={t("detail.moveLeftAria")}
                      disabled={index === 0}
                      intent="ghost"
                      onClick={() => moveStop(index, -1)}
                      size="sm"
                    >
                      ←
                    </Button>
                    <Button
                      aria-label={t("detail.moveRightAria")}
                      disabled={index === stops.length - 1}
                      intent="ghost"
                      onClick={() => moveStop(index, 1)}
                      size="sm"
                    >
                      →
                    </Button>
                    <Button
                      aria-label={t("detail.removeStepAria")}
                      disabled={stops.length <= 2}
                      icon="x"
                      intent="ghost"
                      onClick={() => removeStop(index)}
                      size="sm"
                    />
                  </Stack>
                </Stack>
              </Container>
            </Card>
          </Stack>
        ))}

        <Stack align="start" direction="row">
          <Button icon="plus" intent="ghost" onClick={addStop} size="sm">
            {t("detail.addStep")}
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" gap="100">
        {onCancel && (
          <Button intent="ghost" onClick={onCancel} size="sm">
            {t("detail.cancelAction")}
          </Button>
        )}
        <Button
          disabled={!canSave || saving}
          icon="check"
          intent="primary"
          loading={saving}
          onClick={save}
          size="sm"
        >
          {saveLabel}
        </Button>
      </Stack>
    </Stack>
  );
}
