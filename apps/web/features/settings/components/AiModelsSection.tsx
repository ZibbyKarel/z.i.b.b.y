"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteButton,
  IconTile,
  Panel,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import {
  useAiProvidersQuery,
  useClearOpenAiKeyMutation,
  useSetOpenAiKeyMutation,
} from "../../ai-providers";
import { AiEngineSection } from "./AiEngineSection";
import { BlueCodeCard } from "./BlueCodeCard";

/** Testids for the AI models card (the screen + tests select via these). */
export enum AiModelsSectionTestId {
  Status = "ai-models-openai-status",
  Logo = "ai-models-openai-logo",
  Input = "ai-models-openai-input",
  Save = "ai-models-openai-save",
}

/**
 * Global AI provider keys. One section per provider (OpenAI and BlueCode); the key
 * is write-only — the status shows just its last 4 characters.
 */
export function AiModelsSection() {
  const t = useTranslations("settings.aiModels");
  const { data } = useAiProvidersQuery();
  const set = useSetOpenAiKeyMutation();
  const clear = useClearOpenAiKeyMutation();
  const [value, setValue] = useState("");
  const openai = data?.openai;

  const save = () =>
    set.mutate({ body: { apiKey: value.trim() } }, { onSuccess: () => setValue("") });

  return (
    <Stack gap="200">
      <AiEngineSection />
      <Panel
        header={
          <Stack align="center" direction="row" gap="75">
            <IconTile
              alt=""
              data-testid={AiModelsSectionTestId.Logo}
              glyph="spark"
              size="sm"
              src="/logos/openai.svg"
            />
            {t("openai")}
          </Stack>
        }
        padding="300"
      >
        <Stack gap="200">
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("openaiHint")}
          </Typography>
          <Typography
            data-testid={AiModelsSectionTestId.Status}
            size="sm"
            tone={openai?.configured ? undefined : "bad"}
            type="text"
          >
            {openai?.configured
              ? t("configured", { hint: openai.keyHint ?? "" })
              : t("notConfigured")}
          </Typography>
          <TextInputField
            hideLabel
            autoComplete="off"
            data-testid={AiModelsSectionTestId.Input}
            label={t("keyLabel")}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-…"
            type="password"
            value={value}
          />
          {set.isError && (
            <Typography size="sm" tone="bad" type="text">
              {t("saveFailed")}
            </Typography>
          )}
          <Stack align="center" direction="row" gap="100">
            <Button
              data-testid={AiModelsSectionTestId.Save}
              disabled={value.trim() === "" || set.isPending}
              intent="primary"
              onClick={save}
            >
              {t("save")}
            </Button>
            {openai?.configured && (
              <ConfirmDeleteButton
                confirmLabel={t("clearConfirm")}
                disabled={clear.isPending}
                label={t("clear")}
                onConfirm={() => clear.mutate({})}
              />
            )}
          </Stack>
        </Stack>
      </Panel>
      <BlueCodeCard />
    </Stack>
  );
}
