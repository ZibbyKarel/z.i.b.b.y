"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
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
  SubsystemId,
  UpdateIntegrationInput,
} from "@zibby/contracts";
import { IntegrationIdSchema, SUBSYSTEMS } from "@zibby/contracts";

/** Testids for the integration form (the screens + tests select via these). */
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
  GithubUsername = "integration-github-username",
  CalendarId = "integration-calendar-id",
  CalendarLookahead = "integration-calendar-lookahead",
  Secret = "integration-secret",
  Submit = "integration-submit",
}

/**
 * Controlled form state for an integration, shared by the create dialog and the
 * `/projects/:id/integrations/:integrationId` detail page (N4h) — one place
 * owns the kind-switching config, the validity rules and the payload building.
 * The secret stays write-only: carried out-of-band (never inside the persisted
 * config) and persisted through the separate credentials mutation by the caller
 * (email authenticates with a `password`; Slack/Jira/GitHub/Calendar a `token`).
 */
export interface IntegrationFormState {
  kind: IntegrationKind;
  setKind: (v: IntegrationKind) => void;
  id: string;
  setId: (v: string) => void;
  /** NS2 F1: the subsystem that owns this integration (write-required on create). */
  ownerSubsystem: SubsystemId;
  setOwnerSubsystem: (v: SubsystemId) => void;
  name: string;
  setName: (v: string) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  secret: string;
  setSecret: (v: string) => void;
  channels: string;
  setChannels: (v: string) => void;
  imapHost: string;
  setImapHost: (v: string) => void;
  imapPort: string;
  setImapPort: (v: string) => void;
  smtpHost: string;
  setSmtpHost: (v: string) => void;
  smtpPort: string;
  setSmtpPort: (v: string) => void;
  user: string;
  setUser: (v: string) => void;
  mailbox: string;
  setMailbox: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  jiraEmail: string;
  setJiraEmail: (v: string) => void;
  projectKey: string;
  setProjectKey: (v: string) => void;
  jql: string;
  setJql: (v: string) => void;
  repo: string;
  setRepo: (v: string) => void;
  streamIssues: boolean;
  setStreamIssues: (v: boolean) => void;
  streamPulls: boolean;
  setStreamPulls: (v: boolean) => void;
  githubUsername: string;
  setGithubUsername: (v: string) => void;
  calendarId: string;
  setCalendarId: (v: string) => void;
  lookaheadDays: string;
  setLookaheadDays: (v: string) => void;
  /** Contract-side id validation message while the id is still editable. */
  idError: string | null;
  /** Valid for submit (id counts only while it is still editable). */
  canSave: (idEditable: boolean) => boolean;
  buildCreate: () => CreateIntegrationInput;
  buildPatch: () => UpdateIntegrationInput;
  /** The freshly entered secret, if any — persisted separately by the caller. */
  newSecret: () => string | undefined;
}

export function useIntegrationFormState(
  projectId: string,
  integration?: Integration,
): IntegrationFormState {
  const [kind, setKind] = useState<IntegrationKind>(integration?.kind ?? "slack");
  const [id, setId] = useState(integration?.id ?? "");
  const [ownerSubsystem, setOwnerSubsystem] = useState<SubsystemId>(
    integration?.ownerSubsystem ?? "puls",
  );
  const [name, setName] = useState(integration?.name ?? "");
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [secret, setSecret] = useState("");

  const slackCfg = integration?.config.kind === "slack" ? integration.config : undefined;
  const emailCfg = integration?.config.kind === "email" ? integration.config : undefined;
  const jiraCfg = integration?.config.kind === "jira" ? integration.config : undefined;
  const githubCfg = integration?.config.kind === "github" ? integration.config : undefined;
  const calendarCfg = integration?.config.kind === "calendar" ? integration.config : undefined;

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
  const [streamIssues, setStreamIssues] = useState(
    githubCfg ? githubCfg.streams.includes("issues") : true,
  );
  const [streamPulls, setStreamPulls] = useState(
    githubCfg ? githubCfg.streams.includes("pulls") : true,
  );
  const [githubUsername, setGithubUsername] = useState(githubCfg?.username ?? "");
  const [calendarId, setCalendarId] = useState(calendarCfg?.calendarId ?? "");
  const [lookaheadDays, setLookaheadDays] = useState(String(calendarCfg?.lookaheadDays ?? 14));

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
        return {
          kind: "github",
          repo: repo.trim(),
          streams,
          ...(githubUsername.trim() ? { username: githubUsername.trim() } : {}),
        };
      }
      case "calendar":
        return {
          kind: "calendar",
          calendarId: calendarId.trim() || "primary",
          lookaheadDays: Number(lookaheadDays) || 14,
        };
    }
  };

  /** Per-kind required fields — the payload must validate against the contract. */
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
      case "calendar":
        return Number(lookaheadDays) > 0;
    }
  };

  const idError =
    id.trim().length > 0
      ? (IntegrationIdSchema.safeParse(id.trim()).error?.issues?.[0]?.message ?? null)
      : null;

  return {
    kind,
    setKind,
    id,
    setId,
    ownerSubsystem,
    setOwnerSubsystem,
    name,
    setName,
    enabled,
    setEnabled,
    secret,
    setSecret,
    channels,
    setChannels,
    imapHost,
    setImapHost,
    imapPort,
    setImapPort,
    smtpHost,
    setSmtpHost,
    smtpPort,
    setSmtpPort,
    user,
    setUser,
    mailbox,
    setMailbox,
    baseUrl,
    setBaseUrl,
    jiraEmail,
    setJiraEmail,
    projectKey,
    setProjectKey,
    jql,
    setJql,
    repo,
    setRepo,
    streamIssues,
    setStreamIssues,
    streamPulls,
    setStreamPulls,
    githubUsername,
    setGithubUsername,
    calendarId,
    setCalendarId,
    lookaheadDays,
    setLookaheadDays,
    idError,
    canSave: (idEditable) =>
      (idEditable ? id.trim().length > 0 && idError === null : true) && configReady(),
    buildCreate: () => ({
      id: id.trim(),
      kind,
      projectId,
      ownerSubsystem,
      name: name.trim() || undefined,
      enabled,
      config: buildConfig(),
    }),
    buildPatch: () => ({ name: name.trim() || undefined, enabled, config: buildConfig() }),
    newSecret: () => secret.trim() || undefined,
  };
}

export interface IntegrationFormFieldsProps {
  form: IntegrationFormState;
  /** Lock kind + id — they name/shape the backing entity (edit surface). */
  kindLocked?: boolean;
  /** Whether a secret is already stored server-side (drives the placeholder). */
  hasCredentials?: boolean;
}

/**
 * The integration form body (N4h): a kind dropdown (locked outside create),
 * name, kind-specific config fields and a write-only secret input. The secret
 * is never read back — the field only shows whether one is already stored and
 * lets the operator replace it. Shared by the create-only
 * {@link IntegrationFormDialog} and the project-nested integration detail page.
 */
export function IntegrationFormFields({
  form,
  kindLocked = false,
  hasCredentials = false,
}: IntegrationFormFieldsProps) {
  const t = useTranslations();
  const { kind } = form;

  const secretLabel =
    kind === "email"
      ? t("integrations.password")
      : kind === "slack"
        ? t("integrations.botToken")
        : kind === "calendar"
          ? t("integrations.serviceAccountKey")
          : t("integrations.apiToken");
  const secretPlaceholder = hasCredentials
    ? t("integrations.credentialsStored")
    : t("integrations.credentialsNone");

  return (
    <Stack direction="col" gap="150">
      {kindLocked ? (
        <Field label={t("integrations.kindLabel")}>
          {() => (
            <Typography mono data-testid={IntegrationFormTestId.Kind} size="base" type="note">
              {kind}
            </Typography>
          )}
        </Field>
      ) : (
        <SelectField
          label={t("integrations.kindLabel")}
          onValueChange={(v) => form.setKind(v as IntegrationKind)}
          options={[
            { value: "slack", label: t("integrations.kindSlack") },
            { value: "email", label: t("integrations.kindEmail") },
            { value: "jira", label: t("integrations.kindJira") },
            { value: "github", label: t("integrations.kindGithub") },
            { value: "calendar", label: t("integrations.kindCalendar") },
          ]}
          value={kind}
        />
      )}

      {!kindLocked && (
        <TextInputField
          data-testid="integration-id"
          error={form.idError ?? undefined}
          label={t("integrations.idLabel")}
          onChange={(e) => form.setId(e.target.value)}
          placeholder="team-slack"
          value={form.id}
        />
      )}

      {!kindLocked && (
        <SelectField
          label={t("integrations.ownerSubsystemLabel")}
          onValueChange={(v) => form.setOwnerSubsystem(v as SubsystemId)}
          options={SUBSYSTEMS.map((s) => ({ value: s.id, label: s.name }))}
          value={form.ownerSubsystem}
        />
      )}

      <TextInputField
        data-testid={IntegrationFormTestId.Name}
        label={t("integrations.nameLabel")}
        onChange={(e) => form.setName(e.target.value)}
        value={form.name}
      />

      {kind === "slack" && (
        <TextInputField
          data-testid={IntegrationFormTestId.SlackChannels}
          hint={t("integrations.channelsHint")}
          label={t("integrations.channelsLabel")}
          onChange={(e) => form.setChannels(e.target.value)}
          placeholder="C0123, C0456"
          value={form.channels}
        />
      )}

      {kind === "email" && (
        <>
          <Stack direction="row" gap="100">
            <TextInputField
              data-testid={IntegrationFormTestId.ImapHost}
              label={t("integrations.imapHost")}
              onChange={(e) => form.setImapHost(e.target.value)}
              value={form.imapHost}
            />
            <TextInputField
              data-testid={IntegrationFormTestId.ImapPort}
              label={t("integrations.imapPort")}
              onChange={(e) => form.setImapPort(e.target.value)}
              type="number"
              value={form.imapPort}
            />
          </Stack>
          <Stack direction="row" gap="100">
            <TextInputField
              data-testid={IntegrationFormTestId.SmtpHost}
              label={t("integrations.smtpHost")}
              onChange={(e) => form.setSmtpHost(e.target.value)}
              value={form.smtpHost}
            />
            <TextInputField
              data-testid={IntegrationFormTestId.SmtpPort}
              label={t("integrations.smtpPort")}
              onChange={(e) => form.setSmtpPort(e.target.value)}
              type="number"
              value={form.smtpPort}
            />
          </Stack>
          <TextInputField
            data-testid={IntegrationFormTestId.User}
            label={t("integrations.user")}
            onChange={(e) => form.setUser(e.target.value)}
            value={form.user}
          />
          <TextInputField
            data-testid={IntegrationFormTestId.Mailbox}
            hint={t("integrations.mailboxHint")}
            label={t("integrations.mailbox")}
            onChange={(e) => form.setMailbox(e.target.value)}
            placeholder="INBOX"
            value={form.mailbox}
          />
        </>
      )}

      {kind === "jira" && (
        <>
          <TextInputField
            data-testid={IntegrationFormTestId.JiraBaseUrl}
            hint={t("integrations.jiraBaseUrlHint")}
            label={t("integrations.jiraBaseUrl")}
            onChange={(e) => form.setBaseUrl(e.target.value)}
            placeholder="https://acme.atlassian.net"
            value={form.baseUrl}
          />
          <TextInputField
            data-testid={IntegrationFormTestId.JiraEmail}
            label={t("integrations.jiraEmail")}
            onChange={(e) => form.setJiraEmail(e.target.value)}
            value={form.jiraEmail}
          />
          <Stack direction="row" gap="100">
            <TextInputField
              data-testid={IntegrationFormTestId.JiraProjectKey}
              label={t("integrations.jiraProjectKey")}
              onChange={(e) => form.setProjectKey(e.target.value)}
              placeholder="ACME"
              value={form.projectKey}
            />
          </Stack>
          <TextInputField
            data-testid={IntegrationFormTestId.JiraJql}
            hint={t("integrations.jiraJqlHint")}
            label={t("integrations.jiraJql")}
            onChange={(e) => form.setJql(e.target.value)}
            value={form.jql}
          />
        </>
      )}

      {kind === "calendar" && (
        <>
          <TextInputField
            data-testid={IntegrationFormTestId.CalendarId}
            hint={t("integrations.calendarIdHint")}
            label={t("integrations.calendarId")}
            onChange={(e) => form.setCalendarId(e.target.value)}
            placeholder="primary"
            value={form.calendarId}
          />
          <TextInputField
            data-testid={IntegrationFormTestId.CalendarLookahead}
            hint={t("integrations.calendarLookaheadHint")}
            label={t("integrations.calendarLookahead")}
            onChange={(e) => form.setLookaheadDays(e.target.value)}
            type="number"
            value={form.lookaheadDays}
          />
        </>
      )}

      {kind === "github" && (
        <>
          <TextInputField
            data-testid={IntegrationFormTestId.GithubRepo}
            hint={t("integrations.githubRepoHint")}
            label={t("integrations.githubRepo")}
            onChange={(e) => form.setRepo(e.target.value)}
            placeholder="owner/name"
            value={form.repo}
          />
          <ToggleField
            checked={form.streamIssues}
            data-testid={IntegrationFormTestId.GithubStreamIssues}
            label={t("integrations.githubStreamIssues")}
            onChange={form.setStreamIssues}
          />
          <ToggleField
            checked={form.streamPulls}
            data-testid={IntegrationFormTestId.GithubStreamPulls}
            label={t("integrations.githubStreamPulls")}
            onChange={form.setStreamPulls}
          />
          <TextInputField
            data-testid={IntegrationFormTestId.GithubUsername}
            hint={t("integrations.githubUsernameHint")}
            label={t("integrations.githubUsername")}
            onChange={(e) => form.setGithubUsername(e.target.value)}
            placeholder="octocat"
            value={form.githubUsername}
          />
        </>
      )}

      <TextInputField
        autoComplete="off"
        data-testid={IntegrationFormTestId.Secret}
        label={secretLabel}
        onChange={(e) => form.setSecret(e.target.value)}
        placeholder={secretPlaceholder}
        type="password"
        value={form.secret}
      />

      <ToggleField
        checked={form.enabled}
        label={t("integrations.enabledLabel")}
        onChange={form.setEnabled}
      />
    </Stack>
  );
}
