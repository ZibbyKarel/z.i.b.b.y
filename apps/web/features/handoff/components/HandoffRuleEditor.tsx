"use client";

import { useState } from "react";
import type {
  HandoffRule,
  HandoffRuleInput,
  HandoffSeverity,
  HandoffSignalKind,
  HandoffTarget,
  SubsystemId,
} from "@zibby/contracts";
import { Button, Dropdown, Stack, Typography } from "@zibby/design-system";
import type { DropdownOption } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { signalKindDescription, signalKindLabel } from "../signalKinds";

export enum HandoffRuleEditorTestId {
  Root = "handoff-rule-editor-root",
  SignalKind = "handoff-rule-editor-signal-kind",
  Severity = "handoff-rule-editor-severity",
  Target = "handoff-rule-editor-target",
  Tier = "handoff-rule-editor-tier",
  Save = "handoff-rule-editor-save",
  Cancel = "handoff-rule-editor-cancel",
}

const SEVERITIES: HandoffSeverity[] = ["low", "moderate", "high", "critical"];
const TIERS = ["1", "2", "3"] as const;
type TierOption = (typeof TIERS)[number];
type TargetKind = HandoffTarget["kind"];

/** `subsystem:<id>` / `pipeline:<id>` — a merged target list needs the kind encoded
 * into one option value; split back into `{ kind, id }` on save. */
const ANY_TARGET = "";

function encodeTarget(kind: TargetKind, id: string): string {
  return `${kind}:${id}`;
}

function decodeTarget(value: string): { kind: TargetKind; id: string } | null {
  const sepIndex = value.indexOf(":");
  if (sepIndex < 0) return null;
  const kind = value.slice(0, sepIndex);
  const id = value.slice(sepIndex + 1);
  if (kind !== "subsystem" && kind !== "pipeline") return null;
  return { kind, id };
}

export interface HandoffRuleEditorProps {
  /** The rule being edited, or undefined to create a fresh one. */
  initial?: HandoffRule;
  /** The drawer's own subsystem — `from` is fixed to it, never editable here. */
  fromSubsystemId: SubsystemId;
  subsystemName: string;
  /** The full signal-kind registry (built-ins + operator-registered) — scoped to
   * `fromSubsystemId` internally for the signal picker (Slot B2). */
  signalKinds: HandoffSignalKind[];
  subsystems: { id: string; name: string }[];
  pipelines: { id: string; name: string }[];
  /** Subsystem ids that own ≥1 pipeline or ≥1 agent — mirrors the server's
   * `resolveSubsystemTarget`, which hard-fails dispatch to an empty-roster
   * subsystem. Only NEW target selections are constrained to this set; see
   * `currentTargetSubsystemId` below for the preserve-current guard. */
  receiverSubsystemIds: string[];
  onCancel: () => void;
  onSave: (input: HandoffRuleInput) => void;
  /** True while the save mutation is in flight. */
  pending?: boolean;
}

/**
 * Inline mad-libs editable sentence for a handoff rule (P2 inline-editor design
 * doc) — the editable twin of `HandoffRuleRow`'s read-only sentence, replacing the
 * `HandoffRuleModal` Dialog (which the subsystem drawer's `transform`d fixed panel
 * clips). Same `Stack wrap direction="row"` + `Typography` connector shape as the
 * read row, with inline `Dropdown` pills standing in for the `Pat` chips.
 */
export function HandoffRuleEditor({
  initial,
  fromSubsystemId,
  subsystemName,
  signalKinds,
  subsystems,
  pipelines,
  receiverSubsystemIds,
  onCancel,
  onSave,
  pending = false,
}: HandoffRuleEditorProps) {
  const t = useTranslations("subsystems.handoff");

  // Scope the registry to this drawer's own producer subsystem — the picker
  // only ever offers signals `fromSubsystemId` can actually emit.
  const producerKinds = signalKinds.filter((sk) => sk.from === fromSubsystemId);
  const defaultSignalKind = initial?.signalKind ?? producerKinds[0]?.id ?? "*";
  const defaultTarget = initial
    ? encodeTarget(initial.to.kind, initial.to.id)
    : subsystems[0]
      ? encodeTarget("subsystem", subsystems[0].id)
      : pipelines[0]
        ? encodeTarget("pipeline", pipelines[0].id)
        : ANY_TARGET;

  const [signalKind, setSignalKind] = useState(defaultSignalKind);
  const [severity, setSeverity] = useState<HandoffSeverity | "">(initial?.minSeverity ?? "");
  const [target, setTarget] = useState(defaultTarget);
  const [tier, setTier] = useState<TierOption>(
    initial ? (String(initial.tier) as TierOption) : "2",
  );

  const signalKindOptions: DropdownOption[] = [
    { value: "*", label: t("editor.anySignal") },
    ...producerKinds.map((sk) => ({
      value: sk.id,
      label: signalKindLabel(sk, t),
      // A `pending` kind (registered but not yet emitted by its producer) is
      // marked in the picker instead of showing its normal description — the
      // only DS `DropdownOption` field available for this is `description`.
      description:
        sk.status === "pending" ? t("signalKind.pendingBadge") : signalKindDescription(sk, t),
    })),
  ];

  const severityOptions: DropdownOption<HandoffSeverity | "">[] = [
    { value: "", label: t("editor.anySeverity") },
    ...SEVERITIES.map((s) => ({ value: s, label: t(`severity.${s}`) })),
  ];

  // A subsystem with no pipeline and no agent hard-fails dispatch server-side
  // (`SubsystemEmptyRosterError` in `resolveSubsystemTarget`) — restrict new
  // selections to receivers, but never silently drop the currently-stored
  // target of a rule being edited (stale rule / roster changed since authoring).
  const currentTargetSubsystemId = initial?.to.kind === "subsystem" ? initial.to.id : undefined;
  const visibleSubsystems = subsystems.filter(
    (s) => receiverSubsystemIds.includes(s.id) || s.id === currentTargetSubsystemId,
  );

  const targetOptions: DropdownOption[] = [
    ...visibleSubsystems.map((s) => ({
      value: encodeTarget("subsystem", s.id),
      label: s.name,
      description: t("editor.targetKindSubsystem"),
    })),
    ...pipelines.map((p) => ({
      value: encodeTarget("pipeline", p.id),
      label: p.name,
      description: t("editor.targetKindPipeline"),
    })),
  ];

  const tierOptions: DropdownOption<TierOption>[] = TIERS.map((n) => ({
    value: n,
    label: t(`editor.tierClause.${n}`),
  }));

  const canSave = target !== "";

  const handleSave = () => {
    const decoded = decodeTarget(target);
    if (!decoded) return;
    const to: HandoffTarget =
      decoded.kind === "subsystem"
        ? { kind: "subsystem", id: decoded.id as SubsystemId }
        : { kind: "pipeline", id: decoded.id };
    onSave({
      from: fromSubsystemId,
      signalKind,
      ...(severity ? { minSeverity: severity } : {}),
      to,
      tier: Number(tier) as 1 | 2 | 3,
      enabled: initial?.enabled ?? true,
    });
  };

  return (
    <div data-testid={HandoffRuleEditorTestId.Root}>
      <HudPanel padding="150">
        <Stack wrap align="center" direction="row" gap="75">
          <Typography size="sm" type="text" variant="secondary">
            {t("sentencePrefix", { subject: subsystemName })}
          </Typography>

          <div data-testid={HandoffRuleEditorTestId.SignalKind}>
            <Dropdown
              aria-label={t("editor.signalKindAria")}
              onChange={setSignalKind}
              options={signalKindOptions}
              size="sm"
              value={signalKind}
              variant="inline"
            />
          </div>

          <Typography size="sm" type="text" variant="secondary">
            {t("editor.severityPrefix")}
          </Typography>

          <div data-testid={HandoffRuleEditorTestId.Severity}>
            <Dropdown
              aria-label={t("editor.severityAria")}
              onChange={setSeverity}
              options={severityOptions}
              size="sm"
              value={severity}
              variant="inline"
            />
          </div>

          <Typography size="sm" type="text" variant="secondary">
            {t("targetPrefix")}
          </Typography>

          <div data-testid={HandoffRuleEditorTestId.Target}>
            <Dropdown
              aria-label={t("editor.targetAria")}
              onChange={setTarget}
              options={targetOptions}
              size="sm"
              value={target}
              variant="inline"
            />
          </div>

          <div data-testid={HandoffRuleEditorTestId.Tier}>
            <Dropdown
              aria-label={t("editor.tierAria")}
              onChange={setTier}
              options={tierOptions}
              size="sm"
              value={tier}
              variant="inline"
            />
          </div>

          <Stack align="center" direction="row" gap="100">
            <Button
              aria-label={t("editor.save")}
              data-testid={HandoffRuleEditorTestId.Save}
              disabled={!canSave || pending}
              icon="check"
              intent="primary"
              onClick={handleSave}
              size="sm"
            />
            <Button
              aria-label={t("editor.cancel")}
              data-testid={HandoffRuleEditorTestId.Cancel}
              icon="x"
              intent="ghost"
              onClick={onCancel}
              size="sm"
            />
          </Stack>
        </Stack>
      </HudPanel>
    </div>
  );
}
