"use client";

import { useState } from "react";
import type {
  HandoffRule,
  HandoffRuleInput,
  HandoffSeverity,
  HandoffTarget,
  SubsystemId,
} from "@zibby/contracts";
import { Button, Dialog, SegmentPickerField, Stack, TextInputField } from "@zibby/design-system";
import { FormSelect, FormTextInput, FormToggle, useFormControls } from "@zibby/forms";
import { useTranslations } from "next-intl";

export enum HandoffRuleModalTestId {
  TargetKindPicker = "handoff-rule-modal-target-kind",
}

const SEVERITIES: HandoffSeverity[] = ["low", "moderate", "high", "critical"];
const TIERS = ["1", "2", "3"] as const;
type TierOption = (typeof TIERS)[number];
type TargetKind = HandoffTarget["kind"];

type HandoffRuleFormValues = {
  signalKind: string;
  minSeverity: HandoffSeverity | "";
  targetId: string;
  tier: TierOption;
  enabled: boolean;
};

export interface HandoffRuleModalProps {
  /** The rule being edited, or undefined to create a fresh one. */
  initial?: HandoffRule;
  /** The drawer's own subsystem — `from` is fixed to it, never editable here. */
  fromSubsystemId: SubsystemId;
  subsystemName: string;
  subsystems: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
  onClose: () => void;
  onSave: (rule: HandoffRuleInput) => void;
  /** True while the save mutation is in flight. */
  pending?: boolean;
}

/**
 * Create/edit a subsystem's outgoing handoff rule (P2) — mirrors the gates
 * `RuleModal`'s `useFormControls` + `@zibby/forms` shape. The target `kind`
 * (subsystem/pipeline) is kept OUTSIDE react-hook-form, like `RuleModal`'s own
 * `mode` state: swapping it must reset `targetId` (the two option lists are
 * disjoint id spaces), which is simplest as a plain state setter rather than a
 * watched-field side effect.
 */
export function HandoffRuleModal({
  initial,
  fromSubsystemId,
  subsystemName,
  subsystems,
  pipelines,
  onClose,
  onSave,
  pending = false,
}: HandoffRuleModalProps) {
  const t = useTranslations("handoff");

  const [targetKind, setTargetKind] = useState<TargetKind>(initial?.to.kind ?? "subsystem");

  const { renderForm, submit, form } = useFormControls<HandoffRuleFormValues>({
    defaultValues: {
      signalKind: initial?.signalKind ?? "",
      minSeverity: initial?.minSeverity ?? "",
      targetId: initial?.to.id ?? "",
      tier: initial ? (String(initial.tier) as TierOption) : "2",
      enabled: initial?.enabled ?? true,
    },
    onSubmit: (values) => {
      const signalKind = values.signalKind.trim();
      if (!signalKind || !values.targetId) return;
      // A plain `{ kind: targetKind, id }` object literal doesn't narrow against
      // `HandoffTargetSchema`'s discriminated union (`kind`'s type is the whole
      // `TargetKind` union, not one specific literal) — branch on it explicitly.
      const to: HandoffTarget =
        targetKind === "subsystem"
          ? { kind: "subsystem", id: values.targetId as SubsystemId }
          : { kind: "pipeline", id: values.targetId };
      onSave({
        from: fromSubsystemId,
        signalKind,
        ...(values.minSeverity ? { minSeverity: values.minSeverity } : {}),
        to,
        tier: Number(values.tier) as 1 | 2 | 3,
        enabled: values.enabled,
      });
    },
  });

  const values = form.watch();
  const targetOptions = (targetKind === "subsystem" ? subsystems : pipelines).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const canSave = values.signalKind.trim() !== "" && values.targetId !== "";

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!canSave || pending}
            icon="check"
            intent="primary"
            onClick={() => void submit()}
          >
            {t("saveRule")}
          </Button>
        </>
      }
      onClose={onClose}
      title={initial ? t("editRule") : t("newRule")}
      width="md"
    >
      <Stack gap="200">
        <TextInputField disabled readOnly label={t("from")} value={subsystemName} />

        <FormTextInput<HandoffRuleFormValues>
          hint={t("signalKindHint")}
          label={t("signalKind")}
          name="signalKind"
          placeholder="cve"
        />

        <FormSelect<HandoffSeverity | "", HandoffRuleFormValues>
          hint={t("minSeverityHint")}
          label={t("minSeverity")}
          name="minSeverity"
          options={[
            { value: "", label: t("minSeverityAny") },
            ...SEVERITIES.map((s) => ({ value: s, label: t(`severity.${s}`) })),
          ]}
        />

        {/* `SegmentPickerField` has no `data-testid` passthrough (fixed prop set,
            no `...rest` spread) — the wrapping `div` is what actually carries it,
            same idiom `GatesTab`'s `HudPanel` wrapper uses. */}
        <div data-testid={HandoffRuleModalTestId.TargetKindPicker}>
          <SegmentPickerField
            label={t("targetKind")}
            onValueChange={(v) => {
              setTargetKind(v as TargetKind);
              form.setValue("targetId", "");
            }}
            options={[
              { value: "subsystem", label: t("targetKindSubsystem") },
              { value: "pipeline", label: t("targetKindPipeline") },
            ]}
            value={targetKind}
          />
        </div>

        <FormSelect<string, HandoffRuleFormValues>
          label={t("targetId")}
          name="targetId"
          options={targetOptions}
        />

        <FormSelect<TierOption, HandoffRuleFormValues>
          hint={t(`tierHint.${values.tier}`)}
          label={t("tier")}
          name="tier"
          options={TIERS.map((tier) => ({ value: tier, label: t(`tierOption.${tier}`) }))}
        />

        <FormToggle<HandoffRuleFormValues> label={t("enabled")} name="enabled" />
      </Stack>
    </Dialog>,
  );
}
