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
import type { CreateHookInput, Hook, HookEvent, UpdateHookInput } from "@zibby/contracts";

/** Testids for the hook form (the screens + tests select via these). */
export enum HookFormTestId {
  Id = "hook-id",
  Name = "hook-name",
  Event = "hook-event",
  Matcher = "hook-matcher",
  Command = "hook-command",
  Timeout = "hook-timeout",
  Enabled = "hook-enabled",
  Submit = "hook-submit",
}

/** The Claude Code lifecycle events a hook can register on. */
const HOOK_EVENTS: HookEvent[] = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "SubagentStop",
  "PreCompact",
  "SessionStart",
  "SessionEnd",
];

/** Events that scope to a tool via `matcher`; the rest ignore it. */
const MATCHER_EVENTS = new Set<HookEvent>(["PreToolUse", "PostToolUse"]);

/**
 * Controlled form state for a hook, shared by the create dialog and the
 * `/hooks/:id` detail page (N4e) — one place owns the field wiring, the
 * validity rule and the payload building.
 */
export interface HookFormState {
  id: string;
  setId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  event: HookEvent;
  setEvent: (v: HookEvent) => void;
  matcher: string;
  setMatcher: (v: string) => void;
  command: string;
  setCommand: (v: string) => void;
  timeout: string;
  setTimeout: (v: string) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** True when a matcher applies to the selected event. */
  showMatcher: boolean;
  /** Valid for submit (id needed only while it is still editable). */
  canSave: (idEditable: boolean) => boolean;
  buildCreate: () => CreateHookInput;
  buildPatch: () => UpdateHookInput;
}

export function useHookFormState(hook?: Hook): HookFormState {
  const [id, setId] = useState(hook?.id ?? "");
  const [name, setName] = useState(hook?.name ?? "");
  const [event, setEvent] = useState<HookEvent>(hook?.event ?? "PreToolUse");
  const [matcher, setMatcher] = useState(hook?.matcher ?? "");
  const [command, setCommand] = useState(hook?.command ?? "");
  const [timeout, setTimeout] = useState(hook?.timeout != null ? String(hook.timeout) : "");
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);

  const showMatcher = MATCHER_EVENTS.has(event);

  // Inferred (not the partial UpdateHookInput) so `event`/`command` stay required
  // and the same object satisfies both the create body and the update patch.
  const common = () => {
    const parsedTimeout = Number.parseInt(timeout.trim(), 10);
    return {
      name: name.trim() || undefined,
      event,
      matcher: showMatcher ? matcher.trim() || undefined : undefined,
      command: command.trim(),
      timeout: Number.isInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : undefined,
      enabled,
    };
  };

  return {
    id,
    setId,
    name,
    setName,
    event,
    setEvent,
    matcher,
    setMatcher,
    command,
    setCommand,
    timeout,
    setTimeout,
    enabled,
    setEnabled,
    showMatcher,
    canSave: (idEditable) =>
      (idEditable ? id.trim().length > 0 : true) && command.trim().length > 0,
    buildCreate: () => ({ id: id.trim(), ...common() }),
    buildPatch: common,
  };
}

export interface HookFormFieldsProps {
  form: HookFormState;
  /** Lock the id — it names the backing entity, so the detail page can't change it. */
  idLocked?: boolean;
}

/**
 * The hook form body (N4e): id (locked outside create), name, lifecycle-event
 * dropdown, a matcher (tool-scoped events only), the shell command, an optional
 * timeout and an enabled toggle. Shared by the create-only
 * {@link HookFormDialog} and the `/hooks/:id` detail page.
 */
export function HookFormFields({ form, idLocked = false }: HookFormFieldsProps) {
  const t = useTranslations();

  return (
    <Stack direction="col" gap="150">
      {idLocked ? (
        <Field label={t("hooks.idLabel")}>
          {() => (
            <Typography mono data-testid={HookFormTestId.Id} size="base" type="note">
              {form.id}
            </Typography>
          )}
        </Field>
      ) : (
        <TextInputField
          data-testid={HookFormTestId.Id}
          label={t("hooks.idLabel")}
          onChange={(e) => form.setId(e.target.value)}
          placeholder="audit-log"
          value={form.id}
        />
      )}

      <TextInputField
        data-testid={HookFormTestId.Name}
        label={t("hooks.nameLabel")}
        onChange={(e) => form.setName(e.target.value)}
        value={form.name}
      />

      <SelectField
        data-testid={HookFormTestId.Event}
        label={t("hooks.eventLabel")}
        onValueChange={(v) => form.setEvent(v as HookEvent)}
        options={HOOK_EVENTS.map((e) => ({ value: e, label: e }))}
        value={form.event}
      />

      {form.showMatcher && (
        <TextInputField
          data-testid={HookFormTestId.Matcher}
          hint={t("hooks.matcherHint")}
          label={t("hooks.matcherLabel")}
          onChange={(e) => form.setMatcher(e.target.value)}
          placeholder="Bash"
          value={form.matcher}
        />
      )}

      <TextInputField
        data-testid={HookFormTestId.Command}
        hint={t("hooks.commandHint")}
        label={t("hooks.commandLabel")}
        onChange={(e) => form.setCommand(e.target.value)}
        placeholder="./scripts/audit.sh"
        value={form.command}
      />

      <TextInputField
        data-testid={HookFormTestId.Timeout}
        hint={t("hooks.timeoutHint")}
        label={t("hooks.timeoutLabel")}
        onChange={(e) => form.setTimeout(e.target.value)}
        type="number"
        value={form.timeout}
      />

      <ToggleField checked={form.enabled} label={t("hooks.enabledLabel")} onChange={form.setEnabled} />
    </Stack>
  );
}
