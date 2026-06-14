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
  CreateMcpServerInput,
  McpServer,
  McpTransport,
  UpdateMcpServerInput,
} from "@zibby/contracts";

/** Testids for the MCP server form dialog (the screen + tests select via these). */
export enum McpServerFormTestId {
  Id = "mcp-id",
  Type = "mcp-type",
  Name = "mcp-name",
  Command = "mcp-command",
  Args = "mcp-args",
  Url = "mcp-url",
  Headers = "mcp-headers",
  AuthToken = "mcp-auth-token",
  Enabled = "mcp-enabled",
  Submit = "mcp-submit",
}

/** What the dialog emits on save: the create/update payload plus an optional secret. */
export interface McpServerDraft {
  /** Set only when creating (id + type immutable thereafter). */
  create?: CreateMcpServerInput;
  /** Set only when editing an existing server. */
  update?: { id: string; patch: UpdateMcpServerInput };
  /** A freshly entered auth token to persist separately via the credentials endpoint. */
  authToken?: string;
}

export interface McpServerFormDialogProps {
  /** Omit to create a new server; pass one to edit it. */
  server?: McpServer;
  onClose: () => void;
  onSubmit: (draft: McpServerDraft) => void;
  /** Edit mode only: delete this server (its id is owned by the caller). */
  onDelete?: () => void;
}

/** Parse a comma-separated list into a trimmed, non-empty string array (or undefined). */
function parseList(raw: string): string[] | undefined {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/** Parse `Key: Value` lines into a record (or undefined when none). */
function parseHeaders(raw: string): Record<string, string> | undefined {
  const entries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): [string, string] | null => {
      const idx = line.indexOf(":");
      if (idx < 0) return null;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      return key ? [key, value] : null;
    })
    .filter((e): e is [string, string] => e !== null);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Create/edit dialog for an MCP server (the AgentDetailModal pattern, controlled
 * inputs): a transport dropdown (immutable on edit), name, transport-specific
 * connection fields (stdio → command/args; http/sse → url/headers) and a
 * write-only auth token. The token is never read back — the field only shows
 * whether one is already stored (`hasCredentials`). On submit it emits the
 * create/update payload plus any new token; the screen persists the token through
 * the separate credentials mutation.
 */
export function McpServerFormDialog({
  server,
  onClose,
  onSubmit,
  onDelete,
}: McpServerFormDialogProps) {
  const t = useTranslations();
  const isNew = server === undefined;

  const [id, setId] = useState(server?.id ?? "");
  const [type, setType] = useState<McpTransport>(server?.type ?? "stdio");
  const [name, setName] = useState(server?.name ?? "");
  const [command, setCommand] = useState(server?.command ?? "");
  const [args, setArgs] = useState((server?.args ?? []).join(", "));
  const [url, setUrl] = useState(server?.url ?? "");
  const [headers, setHeaders] = useState(
    Object.entries(server?.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
  );
  const [authToken, setAuthToken] = useState("");
  const [enabled, setEnabled] = useState(server?.enabled ?? true);

  const isStdio = type === "stdio";

  const canSave = isNew
    ? id.trim().length > 0 && (isStdio ? command.trim().length > 0 : url.trim().length > 0)
    : isStdio
      ? command.trim().length > 0
      : url.trim().length > 0;

  const buildConnectionFields = () =>
    isStdio
      ? { command: command.trim(), args: parseList(args), url: undefined, headers: undefined }
      : { command: undefined, args: undefined, url: url.trim(), headers: parseHeaders(headers) };

  const submit = () => {
    const token = authToken.trim() || undefined;
    const fields = buildConnectionFields();
    if (isNew) {
      onSubmit({
        create: {
          id: id.trim(),
          type,
          name: name.trim() || undefined,
          enabled,
          ...fields,
        },
        authToken: token,
      });
    } else {
      onSubmit({
        update: {
          id: server.id,
          patch: { name: name.trim() || undefined, enabled, ...fields },
        },
        authToken: token,
      });
    }
  };

  const tokenPlaceholder = server?.hasCredentials
    ? t("mcp.credentialsStored")
    : t("mcp.credentialsNone");

  return (
    <Dialog
      open
      actions={
        <>
          {!isNew && onDelete && (
            <Button icon="trash" intent="danger" onClick={onDelete}>
              {t("common.delete")}
            </Button>
          )}
          <Button intent="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            data-testid={McpServerFormTestId.Submit}
            disabled={!canSave}
            icon={isNew ? "plus" : "check"}
            intent="primary"
            onClick={submit}
          >
            {isNew ? t("mcp.create") : t("common.save")}
          </Button>
        </>
      }
      ariaLabel={isNew ? t("mcp.addServer") : (server.name ?? server.id)}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={isNew ? t("mcp.addServer") : (server.name ?? server.id)}
      width="lg"
    >
      <Stack direction="col" gap="150">
        {isNew ? (
          <SelectField
            data-testid={McpServerFormTestId.Type}
            label={t("mcp.typeLabel")}
            onValueChange={(v) => setType(v as McpTransport)}
            options={[
              { value: "stdio", label: t("mcp.typeStdio") },
              { value: "http", label: t("mcp.typeHttp") },
              { value: "sse", label: t("mcp.typeSse") },
            ]}
            value={type}
          />
        ) : (
          <Field label={t("mcp.typeLabel")}>
            {() => (
              <Typography mono data-testid={McpServerFormTestId.Type} size="base" type="note">
                {type}
              </Typography>
            )}
          </Field>
        )}

        {isNew && (
          <TextInputField
            data-testid={McpServerFormTestId.Id}
            label={t("mcp.idLabel")}
            onChange={(e) => setId(e.target.value)}
            placeholder="github"
            value={id}
          />
        )}

        <TextInputField
          data-testid={McpServerFormTestId.Name}
          label={t("mcp.nameLabel")}
          onChange={(e) => setName(e.target.value)}
          value={name}
        />

        {isStdio ? (
          <>
            <TextInputField
              data-testid={McpServerFormTestId.Command}
              label={t("mcp.commandLabel")}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx"
              value={command}
            />
            <TextInputField
              data-testid={McpServerFormTestId.Args}
              hint={t("mcp.argsHint")}
              label={t("mcp.argsLabel")}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="-y, @modelcontextprotocol/server-github"
              value={args}
            />
          </>
        ) : (
          <>
            <TextInputField
              data-testid={McpServerFormTestId.Url}
              label={t("mcp.urlLabel")}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com"
              value={url}
            />
            <TextInputField
              data-testid={McpServerFormTestId.Headers}
              hint={t("mcp.headersHint")}
              label={t("mcp.headersLabel")}
              onChange={(e) => setHeaders(e.target.value)}
              placeholder="X-Api-Version: 2024-01"
              value={headers}
            />
          </>
        )}

        <TextInputField
          autoComplete="off"
          data-testid={McpServerFormTestId.AuthToken}
          hint={t("mcp.authTokenHint")}
          label={t("mcp.authTokenLabel")}
          onChange={(e) => setAuthToken(e.target.value)}
          placeholder={tokenPlaceholder}
          type="password"
          value={authToken}
        />

        <ToggleField checked={enabled} label={t("mcp.enabledLabel")} onChange={setEnabled} />
      </Stack>
    </Dialog>
  );
}
