"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  Field,
  SelectField,
  Stack,
  TextInputField,
  ToggleField,
  Typography,
} from "@zibby/design-system";
import type {
  CreateIntegrationInput,
  Integration,
  IntegrationKind,
  UpdateIntegrationInput,
} from "@zibby/contracts";

/** Testids for the integration form dialog (the screen + tests select via these). */
export enum IntegrationFormTestId {
  Kind = "integration-kind",
  Name = "integration-name",
  Enabled = "integration-enabled",
  SlackChannels = "integration-slack-channels",
  ImapHost = "integration-imap-host",
  ImapPort = "integration-imap-port",
  SmtpHost = "integration-smtp-host",
  SmtpPort = "integration-smtp-port",
  User = "integration-user",
  Secret = "integration-secret",
  Submit = "integration-submit",
}

/** What the dialog emits on save: the create/update payload plus an optional secret. */
export interface IntegrationDraft {
  /** Set only when creating (kind + id immutable thereafter). */
  create?: CreateIntegrationInput;
  /** Set only when editing an existing integration. */
  update?: { id: string; patch: UpdateIntegrationInput };
  /** A freshly entered secret to persist separately via the credentials endpoint. */
  secret?: string;
}

export interface IntegrationFormDialogProps {
  /** Omit to create a new integration; pass one to edit it. */
  integration?: Integration;
  onClose: () => void;
  onSubmit: (draft: IntegrationDraft) => void;
}


/**
 * Create/edit dialog for an integration (the AgentDetailModal pattern, NOT the
 * generic EntityFormModal): a kind dropdown, name, kind-specific config fields and
 * a write-only secret input. The secret is never read back — the field only shows
 * whether one is already stored (`hasCredentials`) and lets the operator replace
 * it. On submit the dialog emits the create/update payload plus any new secret;
 * the screen persists the secret through the separate credentials mutation.
 */
export function IntegrationFormDialog({ integration, onClose, onSubmit }: IntegrationFormDialogProps) {
  const t = useTranslations();
  const isNew = integration === undefined;

  const [kind, setKind] = useState<IntegrationKind>(integration?.kind ?? "slack");
  const [id, setId] = useState(integration?.id ?? "");
  const [name, setName] = useState(integration?.name ?? "");
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [secret, setSecret] = useState("");

  const slackCfg = integration?.config.kind === "slack" ? integration.config : undefined;
  const emailCfg = integration?.config.kind === "email" ? integration.config : undefined;
  const [channels, setChannels] = useState((slackCfg?.channels ?? []).join(", "));
  const [imapHost, setImapHost] = useState(emailCfg?.imapHost ?? "");
  const [imapPort, setImapPort] = useState(String(emailCfg?.imapPort ?? 993));
  const [smtpHost, setSmtpHost] = useState(emailCfg?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(emailCfg?.smtpPort ?? 465));
  const [user, setUser] = useState(emailCfg?.user ?? "");

  const buildConfig = (): CreateIntegrationInput["config"] =>
    kind === "slack"
      ? {
          kind: "slack",
          channels: channels
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        }
      : {
          kind: "email",
          imapHost: imapHost.trim(),
          imapPort: Number(imapPort) || 0,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 0,
          user: user.trim(),
        };

  const canSave = isNew
    ? id.trim().length > 0
    : true;

  const submit = () => {
    const trimmedSecret = secret.trim() || undefined;
    if (isNew) {
      onSubmit({
        create: {
          id: id.trim(),
          kind,
          name: name.trim() || undefined,
          enabled,
          config: buildConfig(),
        },
        secret: trimmedSecret,
      });
    } else {
      onSubmit({
        update: {
          id: integration.id,
          patch: { name: name.trim() || undefined, enabled, config: buildConfig() },
        },
        secret: trimmedSecret,
      });
    }
  };

  const secretLabel = kind === "slack" ? t("integrations.botToken") : t("integrations.password");
  const secretPlaceholder =
    integration?.hasCredentials ? t("integrations.credentialsStored") : t("integrations.credentialsNone");

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            data-testid={IntegrationFormTestId.Submit}
            disabled={!canSave}
            icon={isNew ? "plus" : "check"}
            intent="primary"
            onClick={submit}
          >
            {isNew ? t("integrations.create") : t("common.save")}
          </Button>
        </>
      }
      ariaLabel={isNew ? t("integrations.addIntegration") : (integration.name ?? integration.id)}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={isNew ? t("integrations.addIntegration") : (integration.name ?? integration.id)}
      width="lg"
    >
      <Stack direction="col" gap="150">
        {isNew ? (
          <SelectField
            label={t("integrations.kindLabel")}
            onValueChange={(v) => setKind(v as IntegrationKind)}
            options={[
              { value: "slack", label: t("integrations.kindSlack") },
              { value: "email", label: t("integrations.kindEmail") },
            ]}
            value={kind}
          />
        ) : (
          <Field label={t("integrations.kindLabel")}>
            {() => (
              <Typography mono data-testid={IntegrationFormTestId.Kind} size="base" type="note">
                {kind}
              </Typography>
            )}
          </Field>
        )}

        {isNew && (
          <TextInputField
            data-testid="integration-id"
            label={t("integrations.idLabel")}
            onChange={(e) => setId(e.target.value)}
            placeholder="team-slack"
            value={id}
          />
        )}

        <TextInputField
          data-testid={IntegrationFormTestId.Name}
          label={t("integrations.nameLabel")}
          onChange={(e) => setName(e.target.value)}
          value={name}
        />

        {kind === "slack" ? (
          <TextInputField
            data-testid={IntegrationFormTestId.SlackChannels}
            hint={t("integrations.channelsHint")}
            label={t("integrations.channelsLabel")}
            onChange={(e) => setChannels(e.target.value)}
            placeholder="C0123, C0456"
            value={channels}
          />
        ) : (
          <>
            <Stack direction="row" gap="100">
              <TextInputField
                data-testid={IntegrationFormTestId.ImapHost}
                label={t("integrations.imapHost")}
                onChange={(e) => setImapHost(e.target.value)}
                value={imapHost}
              />
              <TextInputField
                data-testid={IntegrationFormTestId.ImapPort}
                label={t("integrations.imapPort")}
                onChange={(e) => setImapPort(e.target.value)}
                type="number"
                value={imapPort}
              />
            </Stack>
            <Stack direction="row" gap="100">
              <TextInputField
                data-testid={IntegrationFormTestId.SmtpHost}
                label={t("integrations.smtpHost")}
                onChange={(e) => setSmtpHost(e.target.value)}
                value={smtpHost}
              />
              <TextInputField
                data-testid={IntegrationFormTestId.SmtpPort}
                label={t("integrations.smtpPort")}
                onChange={(e) => setSmtpPort(e.target.value)}
                type="number"
                value={smtpPort}
              />
            </Stack>
            <TextInputField
              data-testid={IntegrationFormTestId.User}
              label={t("integrations.user")}
              onChange={(e) => setUser(e.target.value)}
              value={user}
            />
          </>
        )}

        <TextInputField
          autoComplete="off"
          data-testid={IntegrationFormTestId.Secret}
          label={secretLabel}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={secretPlaceholder}
          type="password"
          value={secret}
        />

        <ToggleField
          checked={enabled}
          label={t("integrations.enabledLabel")}
          onChange={setEnabled}
        />
      </Stack>
    </Dialog>
  );
}
