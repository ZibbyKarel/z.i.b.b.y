"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stack, StatusDot, Tag, Typography } from "@zibby/design-system";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { KeyValueEditor, type KeyValueRow } from "./KeyValueEditor";

export interface ProjectSecretsPanelProps {
  /** Whether the project already has stored run secrets (drives the status chip). */
  hasSecrets?: boolean;
  /** Secrets mutation in flight (disables the controls). */
  saving?: boolean;
  onSet: (secrets: Record<string, string>) => void;
  onClear: () => void;
}

/** Collapse rows to a record, dropping blank keys (last wins on collision). */
function fromRows(rows: KeyValueRow[]): Record<string, string> | undefined {
  const entries = rows
    .map((r): [string, string] => [r.key.trim(), r.value])
    .filter(([key]) => key.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * The write-only run-secrets editor for an existing project. Values are never read
 * back, so the panel only ever shows whether a secret is stored and an editor to
 * set or clear them — moved here from the old project dialog.
 */
export function ProjectSecretsPanel({
  hasSecrets,
  saving,
  onSet,
  onClear,
}: ProjectSecretsPanelProps) {
  const t = useTranslations("projects");
  const [secretRows, setSecretRows] = useState<KeyValueRow[]>([]);

  return (
    <HudPanel
      action={
        <Tag tone={hasSecrets ? "accent" : "neutral"}>
          <StatusDot size="75" tone={hasSecrets ? "ok" : "idle"} />
          {hasSecrets ? t("fields.secretsStored") : t("fields.secretsNone")}
        </Tag>
      }
      title={t("fields.secrets")}
    >
      <Stack gap="75">
        <Typography size="xs" type="note" variant="tertiary">
          {t("fields.secretsHint")}
        </Typography>
        <KeyValueEditor
          secret
          addLabel={t("fields.secretsAdd")}
          keyLabel={t("fields.secretsKey")}
          keyPlaceholder="OPENAI_API_KEY"
          onChange={setSecretRows}
          removeLabel={t("fields.secretsRemove")}
          rows={secretRows}
          testIdPrefix="project-secret"
          valueLabel={t("fields.secretsValue")}
          valuePlaceholder="sk-…"
        />
        <Stack align="center" direction="row" gap="100">
          <Button
            data-testid="project-secrets-save"
            disabled={saving || fromRows(secretRows) === undefined}
            icon="check"
            intent="ghost"
            onClick={() => {
              const secrets = fromRows(secretRows);
              if (!secrets) return;
              onSet(secrets);
              setSecretRows([]);
            }}
            size="sm"
          >
            {t("fields.secretsSave")}
          </Button>
          {hasSecrets && (
            <Button disabled={saving} icon="trash" intent="danger" onClick={onClear} size="sm">
              {t("fields.secretsClear")}
            </Button>
          )}
        </Stack>
      </Stack>
    </HudPanel>
  );
}
