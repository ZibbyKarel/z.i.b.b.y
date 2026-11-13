"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDeleteButton,
  Panel,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import {
  useAiProvidersQuery,
  useClearBlueCodeMutation,
  useSetBlueCodeMutation,
} from "../../ai-providers";

/** Testids for the BlueCode card. */
export enum BlueCodeCardTestId {
  Status = "bluecode-status",
  BaseUrl = "bluecode-base-url",
  Key = "bluecode-key",
  Save = "bluecode-save",
  Refresh = "bluecode-refresh",
}

/** The server's `message` of a 422 (ts-rest rejects with `{ status, body }`), else undefined. */
function saveError(error: unknown): string | undefined {
  const e = error as { status?: unknown; body?: { message?: unknown } } | null;
  return e?.status === 422 && typeof e.body?.message === "string" ? e.body.message : undefined;
}

/**
 * BlueCode — team.blue's OpenAI-compatible LLM gateway, a fourth model family. The key is
 * write-only; Refresh re-reads the gateway's model list without re-entering it.
 */
export function BlueCodeCard() {
  const t = useTranslations("settings.aiModels.bluecode");
  const { data } = useAiProvidersQuery();
  const set = useSetBlueCodeMutation();
  const clear = useClearBlueCodeMutation();
  const bluecode = data?.bluecode;
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const baseUrl = url.trim() || bluecode?.baseUrl || "";

  const save = () =>
    set.mutate(
      { body: { baseUrl, apiKey: key.trim() } },
      { onSuccess: () => (setKey(""), setUrl("")) },
    );
  const refresh = () => set.mutate({ body: { baseUrl } });

  return (
    <Panel header={t("title")} padding="300">
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("hint")}
        </Typography>
        <Typography
          data-testid={BlueCodeCardTestId.Status}
          size="sm"
          tone={bluecode?.configured ? undefined : "bad"}
          type="text"
        >
          {bluecode?.configured
            ? t("configured", {
                hint: bluecode.keyHint ?? "",
                url: bluecode.baseUrl ?? "",
                count: bluecode.modelCount ?? 0,
              })
            : t("notConfigured")}
        </Typography>
        <TextInputField
          autoComplete="off"
          data-testid={BlueCodeCardTestId.BaseUrl}
          label={t("baseUrlLabel")}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={bluecode?.baseUrl ?? "https://bluecode.ai.team.blue/projects/<id>/v1"}
          value={url}
        />
        <TextInputField
          autoComplete="off"
          data-testid={BlueCodeCardTestId.Key}
          label={t("keyLabel")}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
          type="password"
          value={key}
        />
        {set.isError && (
          <Typography size="sm" tone="bad" type="text">
            {saveError(set.error) ?? t("saveFailed")}
          </Typography>
        )}
        <Stack align="center" direction="row" gap="100">
          <Button
            data-testid={BlueCodeCardTestId.Save}
            disabled={baseUrl === "" || key.trim() === "" || set.isPending}
            intent="primary"
            onClick={save}
          >
            {t("save")}
          </Button>
          {bluecode?.configured && (
            <>
              <Button
                data-testid={BlueCodeCardTestId.Refresh}
                disabled={baseUrl === "" || set.isPending}
                onClick={refresh}
              >
                {t("refresh")}
              </Button>
              <ConfirmDeleteButton
                confirmLabel={t("clearConfirm")}
                disabled={clear.isPending}
                label={t("clear")}
                onConfirm={() => clear.mutate({})}
              />
            </>
          )}
        </Stack>
      </Stack>
    </Panel>
  );
}
