"use client";

import { useTranslations } from "next-intl";
import { SelectField, Typography } from "@zibby/design-system";
import type { AiEngineModel } from "@zibby/contracts";

/** Testids for the opencode model picker. */
export enum AiEngineModelPickerTestId {
  Notice = "ai-engine-model-picker-notice",
  Missing = "ai-engine-model-picker-missing",
  NoModels = "ai-engine-model-picker-no-models",
  NoFree = "ai-engine-model-picker-no-free",
}

export interface AiEngineModelPickerProps {
  /** The opencode engine's `provider/model` list. */
  models: AiEngineModel[];
  /** Chosen `provider/model` id, `""` when none. */
  value: string;
  onChange: (id: string) => void;
  /** The engine list has loaded — only then can a chosen model be called missing. */
  loaded?: boolean;
  /** Field label; defaults to "opencode model". */
  label?: string;
  /** Offer an empty "none" choice (an optional override). */
  clearable?: boolean;
  /** Skip the list-wide "no models / none free" warnings (when several pickers stack). */
  quiet?: boolean;
}

/** Whether `value` names a model that is chosen but absent from the engine's list. */
export function isModelMissing(models: AiEngineModel[], value: string): boolean {
  return value !== "" && !models.some((m) => m.id === value);
}

/**
 * opencode model picker shared by Settings and the agent editor. Free models come first and are
 * marked "free"; picking one that is not free shows a cost notice (everything should be free).
 * ponytail: plain select, no search — the DS has no searchable combobox yet.
 */
export function AiEngineModelPicker({
  models,
  value,
  onChange,
  loaded = true,
  label,
  clearable = false,
  quiet = false,
}: AiEngineModelPickerProps) {
  const t = useTranslations("aiEngine");
  // Groups: free, Claude subscription, other (paid). Array sort is stable within a group.
  const rank = (m: AiEngineModel) => (m.free ? 0 : m.subscription ? 1 : 2);
  const sorted = [...models].sort((a, b) => rank(a) - rank(b));
  const options = sorted.map((m) => ({
    value: m.id,
    label: [
      m.id,
      m.free ? t("free") : m.subscription ? t("subscription") : "",
      m.variants.length > 0 ? t("thinkingTag") : "",
    ]
      .filter(Boolean)
      .join(" · "),
  }));
  const missing = loaded && isModelMissing(models, value);
  // Keep a no-longer-listed choice visible so the control does not look empty.
  if (missing) options.unshift({ value, label: value });
  if (clearable) options.unshift({ value: "", label: t("modelNone") });
  const chosen = models.find((m) => m.id === value);

  return (
    <>
      <SelectField
        label={label ?? t("model")}
        onValueChange={onChange}
        options={options}
        placeholder={t("modelPlaceholder")}
        value={value}
      />
      {!quiet && loaded && models.length === 0 && (
        <Typography
          data-testid={AiEngineModelPickerTestId.NoModels}
          size="sm"
          tone="warn"
          type="text"
        >
          {t("noModels")}
        </Typography>
      )}
      {!quiet && loaded && models.length > 0 && !models.some((m) => m.free) && (
        <Typography
          data-testid={AiEngineModelPickerTestId.NoFree}
          size="sm"
          tone="warn"
          type="text"
        >
          {t("noFreeModels")}
        </Typography>
      )}
      {missing && (
        <Typography
          data-testid={AiEngineModelPickerTestId.Missing}
          size="sm"
          tone="bad"
          type="text"
        >
          {t("modelMissing")}
        </Typography>
      )}
      {chosen && !chosen.free && !chosen.subscription && (
        <Typography
          data-testid={AiEngineModelPickerTestId.Notice}
          size="sm"
          tone="warn"
          type="text"
        >
          {t("paidNotice")}
        </Typography>
      )}
    </>
  );
}
