"use client";

import { useTranslations } from "next-intl";
import { ButtonGroup, Panel, Stack, Typography } from "@zibby/design-system";
import {
  type AiEngine,
  type AiEngineStatus,
  MODEL_TIERS,
  type ModelTier,
  type SystemConfig,
} from "@zibby/contracts";
import {
  AiEngineModelPicker,
  OperatorTokenNotice,
  isModelMissing,
  useAiEnginesQuery,
} from "../../ai-providers";
import { isOperatorTokenError } from "../../../state/operatorToken";
import { useSetSystemConfigMutation, useSystemConfigQuery } from "../../system";

/** Testids for the AI engine card. */
export enum AiEngineSectionTestId {
  Switch = "ai-engine-switch",
  ClaudeStatus = "ai-engine-claude-status",
  OpencodeStatus = "ai-engine-opencode-status",
  Providers = "ai-engine-providers",
  NoProviders = "ai-engine-no-providers",
  Blocked = "ai-engine-blocked",
  Levels = "ai-engine-levels",
  /** Suffixed with the tier, e.g. `ai-engine-level-haiku`. */
  Level = "ai-engine-level",
}

const ENGINES: AiEngine[] = ["claude", "opencode"];

/**
 * Global run-engine choice (Claude subscription vs opencode) plus the opencode model.
 * Persisted on the file-backed SystemConfig with the same spread-PUT as the chat section.
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
  const claude = engines?.find((e) => e.id === "claude");
  const opencode = engines?.find((e) => e.id === "opencode");
  const models = opencode?.models ?? [];
  const model = config.opencodeModel;

  // Why opencode cannot be switched on right now (A7) — explained inline, not failed later.
  const blocked = !opencode?.available
    ? t("blockedUnavailable")
    : model === ""
      ? t("blockedNoModel")
      : isModelMissing(models, model)
        ? t("modelMissing")
        : undefined;

  const chooseEngine = (next: string) => {
    if (next === config.aiEngine) return;
    if (next === "opencode" && blocked) return;
    setConfig.mutate({ body: { ...config, aiEngine: next as AiEngine } });
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

  const status = (e: AiEngineStatus | undefined, name: string) =>
    !e
      ? name
      : e.available
        ? t("available", { name, version: e.version ?? "?" })
        : t("notInstalled", { name });

  return (
    <Panel header={t("title")} padding="300">
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("hint")}
        </Typography>

        <span data-testid={AiEngineSectionTestId.Switch}>
          <ButtonGroup
            ariaLabel={t("title")}
            onChange={chooseEngine}
            options={ENGINES.map((e) => ({ id: e, label: t(`engine.${e}`) }))}
            value={config.aiEngine}
          />
        </span>
        {blocked && (
          <Typography data-testid={AiEngineSectionTestId.Blocked} size="sm" tone="warn" type="text">
            {t("blockedPrefix", { reason: blocked })}
          </Typography>
        )}

        <Typography data-testid={AiEngineSectionTestId.ClaudeStatus} size="sm" type="text">
          {status(claude, t("engine.claude"))}
        </Typography>
        <Typography data-testid={AiEngineSectionTestId.OpencodeStatus} size="sm" type="text">
          {status(opencode, t("engine.opencode"))}
        </Typography>

        {opencode?.available && (
          <>
            <Typography leading="snug" size="sm" type="note" variant="secondary">
              {models.some((m) => m.id.startsWith("claude-agent/"))
                ? t("claudeAgentConnected")
                : t("claudeAgentHint")}
            </Typography>
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
