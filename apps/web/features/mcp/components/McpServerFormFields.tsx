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
  CreateMcpServerInput,
  McpServer,
  McpTransport,
  UpdateMcpServerInput,
} from "@zibby/contracts";

/** Testids for the MCP server form (the screens + tests select via these). */
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
 * Controlled form state for an MCP server, shared by the create dialog and the
 * `/mcp/:id` detail page (N4e) — one place owns the field wiring, the validity
 * rule and the payload building. The auth token stays write-only: it is carried
 * out-of-band (never inside the persisted config) and persisted through the
 * separate credentials mutation by the caller.
 */
export interface McpFormState {
  id: string;
  setId: (v: string) => void;
  type: McpTransport;
  setType: (v: McpTransport) => void;
  name: string;
  setName: (v: string) => void;
  command: string;
  setCommand: (v: string) => void;
  args: string;
  setArgs: (v: string) => void;
  url: string;
  setUrl: (v: string) => void;
  headers: string;
  setHeaders: (v: string) => void;
  authToken: string;
  setAuthToken: (v: string) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  isStdio: boolean;
  /** Valid for submit (id needed only while it is still editable). */
  canSave: (idEditable: boolean) => boolean;
  buildCreate: () => CreateMcpServerInput;
  buildPatch: () => UpdateMcpServerInput;
  /** The freshly entered token, if any — persisted separately by the caller. */
  newAuthToken: () => string | undefined;
}

export function useMcpFormState(server?: McpServer): McpFormState {
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

  const connectionFields = () =>
    isStdio
      ? { command: command.trim(), args: parseList(args), url: undefined, headers: undefined }
      : { command: undefined, args: undefined, url: url.trim(), headers: parseHeaders(headers) };

  return {
    id,
    setId,
    type,
    setType,
    name,
    setName,
    command,
    setCommand,
    args,
    setArgs,
    url,
    setUrl,
    headers,
    setHeaders,
    authToken,
    setAuthToken,
    enabled,
    setEnabled,
    isStdio,
    canSave: (idEditable) =>
      (idEditable ? id.trim().length > 0 : true) &&
      (isStdio ? command.trim().length > 0 : url.trim().length > 0),
    buildCreate: () => ({
      id: id.trim(),
      type,
      name: name.trim() || undefined,
      enabled,
      ...connectionFields(),
    }),
    buildPatch: () => ({ name: name.trim() || undefined, enabled, ...connectionFields() }),
    newAuthToken: () => authToken.trim() || undefined,
  };
}

export interface McpServerFormFieldsProps {
  form: McpFormState;
  /** Lock id + transport — they name/shape the backing entity (edit surface). */
  idLocked?: boolean;
  /** Whether a token is already stored server-side (drives the placeholder). */
  hasCredentials?: boolean;
}

/**
 * The MCP server form body (N4e): a transport dropdown (locked outside create),
 * name, transport-specific connection fields (stdio → command/args; http/sse →
 * url/headers) and a write-only auth token. Shared by the create-only
 * {@link McpServerFormDialog} and the `/mcp/:id` detail page.
 */
export function McpServerFormFields({
  form,
  idLocked = false,
  hasCredentials = false,
}: McpServerFormFieldsProps) {
  const t = useTranslations();

  const tokenPlaceholder = hasCredentials ? t("mcp.credentialsStored") : t("mcp.credentialsNone");

  return (
    <Stack direction="col" gap="150">
      {idLocked ? (
        <Field label={t("mcp.typeLabel")}>
          {() => (
            <Typography mono data-testid={McpServerFormTestId.Type} size="base" type="note">
              {form.type}
            </Typography>
          )}
        </Field>
      ) : (
        <SelectField
          data-testid={McpServerFormTestId.Type}
          label={t("mcp.typeLabel")}
          onValueChange={(v) => form.setType(v as McpTransport)}
          options={[
            { value: "stdio", label: t("mcp.typeStdio") },
            { value: "http", label: t("mcp.typeHttp") },
            { value: "sse", label: t("mcp.typeSse") },
          ]}
          value={form.type}
        />
      )}

      {!idLocked && (
        <TextInputField
          data-testid={McpServerFormTestId.Id}
          label={t("mcp.idLabel")}
          onChange={(e) => form.setId(e.target.value)}
          placeholder="github"
          value={form.id}
        />
      )}

      <TextInputField
        data-testid={McpServerFormTestId.Name}
        label={t("mcp.nameLabel")}
        onChange={(e) => form.setName(e.target.value)}
        value={form.name}
      />

      {form.isStdio ? (
        <>
          <TextInputField
            data-testid={McpServerFormTestId.Command}
            label={t("mcp.commandLabel")}
            onChange={(e) => form.setCommand(e.target.value)}
            placeholder="npx"
            value={form.command}
          />
          <TextInputField
            data-testid={McpServerFormTestId.Args}
            hint={t("mcp.argsHint")}
            label={t("mcp.argsLabel")}
            onChange={(e) => form.setArgs(e.target.value)}
            placeholder="-y, @modelcontextprotocol/server-github"
            value={form.args}
          />
        </>
      ) : (
        <>
          <TextInputField
            data-testid={McpServerFormTestId.Url}
            label={t("mcp.urlLabel")}
            onChange={(e) => form.setUrl(e.target.value)}
            placeholder="https://mcp.example.com"
            value={form.url}
          />
          <TextInputField
            data-testid={McpServerFormTestId.Headers}
            hint={t("mcp.headersHint")}
            label={t("mcp.headersLabel")}
            onChange={(e) => form.setHeaders(e.target.value)}
            placeholder="X-Api-Version: 2024-01"
            value={form.headers}
          />
        </>
      )}

      <TextInputField
        autoComplete="off"
        data-testid={McpServerFormTestId.AuthToken}
        hint={t("mcp.authTokenHint")}
        label={t("mcp.authTokenLabel")}
        onChange={(e) => form.setAuthToken(e.target.value)}
        placeholder={tokenPlaceholder}
        type="password"
        value={form.authToken}
      />

      <ToggleField checked={form.enabled} label={t("mcp.enabledLabel")} onChange={form.setEnabled} />
    </Stack>
  );
}
