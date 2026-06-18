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
  Mailbox = "integration-mailbox",
  JiraBaseUrl = "integration-jira-base-url",
  JiraEmail = "integration-jira-email",
  JiraProjectKey = "integration-jira-project-key",
  JiraJql = "integration-jira-jql",
  GithubRepo = "integration-github-repo",
  GithubStreamIssues = "integration-github-stream-issues",
  GithubStreamPulls = "integration-github-stream-pulls",
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
  /** The owning project (one project = one company); baked into the create payload. */
  projectId: string;
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
 * the screen persists the secret through the separate credentials mutation
 * (Slack/Jira/GitHub carry a `token`, email a `password`).
 */
export function IntegrationFormDialog({ projectId, integration, onClose, onSubmit }: IntegrationFormDialogProps) {
  const t = useTranslations();
  const isNew = integration === undefined;

  const [kind, setKind] = useState<IntegrationKind>(integration?.kind ?? "slack");
  const [id, setId] = useState(integration?.id ?? "");
  const [name, setName] = useState(integration?.name ?? "");
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [secret, setSecret] = useState("");

  const slackCfg = integration?.config.kind === "slack" ? integration.config : undefined;
  const emailCfg = integration?.config.kind === "email" ? integration.config : undefined;
  const jiraCfg = integration?.config.kind === "jira" ? integration.config : undefined;
  const githubCfg = integration?.config.kind === "github" ? integration.config : undefined;

  const [channels, setChannels] = useState((slackCfg?.channels ?? []).join(", "));
  const [imapHost, setImapHost] = useState(emailCfg?.imapHost ?? "");
  const [imapPort, setImapPort] = useState(String(emailCfg?.imapPort ?? 993));
  const [smtpHost, setSmtpHost] = useState(emailCfg?.smtpHost ?? "");
  const [smtpPort, setSmtpPort] = useState(String(emailCfg?.smtpPort ?? 465));
  const [user, setUser] = useState(emailCfg?.user ?? "");
  const [mailbox, setMailbox] = useState(emailCfg?.mailbox ?? "");
  const [baseUrl, setBaseUrl] = useState(jiraCfg?.baseUrl ?? "");
  const [jiraEmail, setJiraEmail] = useState(jiraCfg?.email ?? "");
  const [projectKey, setProjectKey] = useState(jiraCfg?.projectKey ?? "");
  const [jql, setJql] = useState(jiraCfg?.jql ?? "");
  const [repo, setRepo] = useState(githubCfg?.repo ?? "");
  const [streamIssues, setStreamIssues] = useState(githubCfg ? githubCfg.streams.includes("issues") : true);
  const [streamPulls, setStreamPulls] = useState(githubCfg ? githubCfg.streams.includes("pulls") : true);

  const buildConfig = (): CreateIntegrationInput["config"] => {
    switch (kind) {
      case "slack":
        return {
          kind: "slack",
          channels: channels
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
        };
      case "email":
        return {
          kind: "email",
          imapHost: imapHost.trim(),
          imapPort: Number(imapPort) || 0,
          smtpHost: smtpHost.trim(),
          smtpPort: Number(smtpPort) || 0,
          user: user.trim(),
          ...(mailbox.trim() ? { mailbox: mailbox.trim() } : {}),
        };
      case "jira":
        return {
          kind: "jira",
          baseUrl: baseUrl.trim(),
          email: jiraEmail.trim(),
          ...(projectKey.trim() ? { projectKey: projectKey.trim() } : {}),
          ...(jql.trim() ? { jql: jql.trim() } : {}),
        };
      case "github": {
        const streams = [
          ...(streamIssues ? (["issues"] as const) : []),
          ...(streamPulls ? (["pulls"] as const) : []),
        ];
        return { kind: "github", repo: repo.trim(), streams };
      }
    }
  };

  /** Per-kind required fields — the create payload must validate against the contract. */
  const configReady = (): boolean => {
    switch (kind) {
      case "slack":
        return true;
      case "email":
        return imapHost.trim().length > 0 && smtpHost.trim().length > 0 && user.trim().length > 0;
      case "jira":
        return baseUrl.trim().length > 0 && jiraEmail.trim().length > 0;
      case "github":
        return /^[^/]+\/[^/]+$/.test(repo.trim());
    }
  };

  const canSave = (isNew ? id.trim().length > 0 : true) && configReady();

  const submit = () => {
    const trimmedSecret = secret.trim() || undefined;
    if (isNew) {
      onSubmit({
        create: {
          id: id.trim(),
          kind,
          projectId,
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

  const secretLabel =
    kind === "email"
      ? t("integrations.password")
      : kind === "slack"
        ? t("integrations.botToken")
        : t("integrations.apiToken");
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
              { value: "jira", label: t("integrations.kindJira") },
              { value: "github", label: t("integrations.kindGithub") },
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

        {kind === "slack" && (
          <TextInputField
            data-testid={IntegrationFormTestId.SlackChannels}
            hint={t("integrations.channelsHint")}
            label={t("integrations.channelsLabel")}
            onChange={(e) => setChannels(e.target.value)}
            placeholder="C0123, C0456"
            value={channels}
          />
        )}

        {kind === "email" && (
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
            <TextInputField
              data-testid={IntegrationFormTestId.Mailbox}
              hint={t("integrations.mailboxHint")}
              label={t("integrations.mailbox")}
              onChange={(e) => setMailbox(e.target.value)}
              placeholder="INBOX"
              value={mailbox}
            />
          </>
        )}

        {kind === "jira" && (
          <>
            <TextInputField
              data-testid={IntegrationFormTestId.JiraBaseUrl}
              hint={t("integrations.jiraBaseUrlHint")}
              label={t("integrations.jiraBaseUrl")}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://acme.atlassian.net"
              value={baseUrl}
            />
            <TextInputField
              data-testid={IntegrationFormTestId.JiraEmail}
              label={t("integrations.jiraEmail")}
              onChange={(e) => setJiraEmail(e.target.value)}
              value={jiraEmail}
            />
            <Stack direction="row" gap="100">
              <TextInputField
                data-testid={IntegrationFormTestId.JiraProjectKey}
                label={t("integrations.jiraProjectKey")}
                onChange={(e) => setProjectKey(e.target.value)}
                placeholder="ACME"
                value={projectKey}
              />
            </Stack>
            <TextInputField
              data-testid={IntegrationFormTestId.JiraJql}
              hint={t("integrations.jiraJqlHint")}
              label={t("integrations.jiraJql")}
              onChange={(e) => setJql(e.target.value)}
              value={jql}
            />
          </>
        )}

        {kind === "github" && (
          <>
            <TextInputField
              data-testid={IntegrationFormTestId.GithubRepo}
              hint={t("integrations.githubRepoHint")}
              label={t("integrations.githubRepo")}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/name"
              value={repo}
            />
            <ToggleField
              checked={streamIssues}
              data-testid={IntegrationFormTestId.GithubStreamIssues}
              label={t("integrations.githubStreamIssues")}
              onChange={setStreamIssues}
            />
            <ToggleField
              checked={streamPulls}
              data-testid={IntegrationFormTestId.GithubStreamPulls}
              label={t("integrations.githubStreamPulls")}
              onChange={setStreamPulls}
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
