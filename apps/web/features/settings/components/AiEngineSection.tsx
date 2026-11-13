"use client";

import { useTranslations } from "next-intl";
import { ButtonGroup, Panel, Stack, Typography } from "@zibby/design-system";
import {
  type AiEngineStatus,
  MODEL_FAMILIES,
  MODEL_FAMILY_PROVIDER,
  MODEL_TIERS,
  type ModelFamily,
  type ModelTier,
  type SystemConfig,
  applyModelFamily,
} from "@zibby/contracts";
import { AiEngineModelPicker, OperatorTokenNotice, useAiEnginesQuery } from "../../ai-providers";
import { isOperatorTokenError } from "../../../state/operatorToken";
import { useSetSystemConfigMutation, useSystemConfigQuery } from "../../system";

/** Testids for the AI engine card. */
export enum AiEngineSectionTestId {
  Family = "ai-engine-family",
  OpencodeStatus = "ai-engine-opencode-status",
  /** Suffixed with the family, e.g. `ai-engine-family-hint-openai`. */
  FamilyHint = "ai-engine-family-hint",
  Unchecked = "ai-engine-unchecked",
  Providers = "ai-engine-providers",
  NoProviders = "ai-engine-no-providers",
  Blocked = "ai-engine-blocked",
  Levels = "ai-engine-levels",
  /** Suffixed with the tier, e.g. `ai-engine-level-haiku`. */
  Level = "ai-engine-level",
}

/**
 * Everything runs on opencode (A31): the operator picks a model family (Claude / OpenAI /
 * OpenCode free), which presets the level models and the default model; the pickers below
 * stay for manual overrides. Persisted on the file-backed SystemConfig with a spread-PUT.
 * Credentials are never entered here: connecting a provider is `opencode auth login` in a terminal.
 */
export function AiEngineSection() {
  const { data: config } = useSystemConfigQuery();
  const { data: engines } = useAiEnginesQuery();
  if (!config) return null;
  return <AiEngineEditor config={config} engines={engines?.engines} />;
}

interface AiEngineEditorProps {
  config: SystemConfig;
  engines: AiEngineStatus[] | undefined;
}

function AiEngineEditor({ config, engines }: AiEngineEditorProps) {
  const t = useTranslations("aiEngine");
  const setConfig = useSetSystemConfigMutation();
  const opencode = engines?.find((e) => e.id === "opencode");
  const models = opencode?.models ?? [];
  const model = config.opencodeModel;

  // An unreadable catalog (binary missing / empty list) cannot filter a preset: it is written as is.
  const catalogReadable = !!opencode?.available && models.length > 0;
  const connected = (family: ModelFamily) =>
    models.some((m) => m.id.startsWith(`${MODEL_FAMILY_PROVIDER[family]}/`));
  const disconnected = catalogReadable ? MODEL_FAMILIES.filter((f) => !connected(f)) : [];

  const chooseFamily = (next: string) => {
    const family = next as ModelFamily;
    if (family === config.modelFamily || disconnected.includes(family)) return;
    setConfig.mutate({
      body: {
        ...config,
        ...applyModelFamily(family, catalogReadable ? models.map((m) => m.id) : undefined),
      },
    });
  };
  const chooseModel = (id: string) => setConfig.mutate({ body: { ...config, opencodeModel: id } });

  const chooseTierModel = (tier: ModelTier, id: string) => {
    const rest = Object.fromEntries(
      Object.entries(config.opencodeTierModels).filter(([k]) => k !== tier),
    );
    setConfig.mutate({
      body: { ...config, opencodeTierModels: id ? { ...rest, [tier]: id } : rest },
    });
  };

  return (
    <Panel header={t("title")} padding="300">
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("hint")}
        </Typography>

        <Typography data-testid={AiEngineSectionTestId.OpencodeStatus} size="sm" type="text">
          {!opencode
            ? t("runsOn")
            : opencode.available
              ? t("runsOnAvailable", { version: opencode.version ?? "?" })
              : t("runsOnMissing")}
        </Typography>
        {opencode && !opencode.available && (
          <Typography data-testid={AiEngineSectionTestId.Blocked} size="sm" tone="warn" type="text">
            {t("blockedUnavailable")}
          </Typography>
        )}

        <span data-testid={AiEngineSectionTestId.Family}>
          <ButtonGroup
            ariaLabel={t("familyTitle")}
            onChange={chooseFamily}
            options={MODEL_FAMILIES.map((f) => ({ id: f, label: t(`family.${f}`) }))}
            value={config.modelFamily}
          />
        </span>
        {disconnected.map((f) => (
          <Typography
            data-testid={`${AiEngineSectionTestId.FamilyHint}-${f}`}
            key={f}
            leading="snug"
            size="sm"
            tone="warn"
            type="text"
          >
            {f === "bluecode"
              ? t("familyBlueCodeNotConnected", { family: t(`family.${f}`) })
              : t("familyNotConnected", {
                  family: t(`family.${f}`),
                  command: `opencode auth login ${MODEL_FAMILY_PROVIDER[f]}`,
                })}
          </Typography>
        ))}
        {!catalogReadable && (
          <Typography
            data-testid={AiEngineSectionTestId.Unchecked}
            leading="snug"
            size="2xs"
            type="note"
            variant="tertiary"
          >
            {t("presetUnchecked")}
          </Typography>
        )}

        {opencode?.available && (
          <>
            {opencode.providers && opencode.providers.length > 0 ? (
              <Typography data-testid={AiEngineSectionTestId.Providers} size="sm" type="text">
                {t("providers", { list: opencode.providers.join(", ") })}
              </Typography>
            ) : (
              <Typography
                data-testid={AiEngineSectionTestId.NoProviders}
                leading="snug"
                size="sm"
                type="note"
                variant="secondary"
              >
                {t("noProviders")}
              </Typography>
            )}
            <AiEngineModelPicker
              label={t("defaultModel")}
              loaded={engines !== undefined}
              models={models}
              onChange={chooseModel}
              value={model}
            />
            <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
              {t("levelsHint")}
            </Typography>
            <Stack data-testid={AiEngineSectionTestId.Levels} gap="100">
              <Typography mono size="sm" type="note" variant="secondary">
                {t("levelsTitle")}
              </Typography>
              {MODEL_TIERS.map((tier, i) => (
                <span data-testid={`${AiEngineSectionTestId.Level}-${tier}`} key={tier}>
                  <AiEngineModelPicker
                    clearable
                    quiet
                    label={t("levelRow", { n: i + 1, name: tier })}
                    loaded={engines !== undefined}
                    models={models}
                    onChange={(id) => chooseTierModel(tier, id)}
                    value={config.opencodeTierModels[tier] ?? ""}
                  />
                </span>
              ))}
            </Stack>
          </>
        )}
        {setConfig.isError &&
          (isOperatorTokenError(setConfig.error) ? (
            <OperatorTokenNotice />
          ) : (
            <Typography size="sm" tone="bad" type="text">
              {t("saveFailed")}
            </Typography>
          ))}
      </Stack>
    </Panel>
  );
}
