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
import type { CreateHookInput, Hook, HookEvent, UpdateHookInput } from "@zibby/contracts";

/** Testids for the hook form dialog (the screen + tests select via these). */
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

/** What the dialog emits on save: a create payload or an update patch. */
export interface HookDraft {
  /** Set only when creating (id immutable thereafter). */
  create?: CreateHookInput;
  /** Set only when editing an existing hook. */
  update?: { id: string; patch: UpdateHookInput };
}

export interface HookFormDialogProps {
  /** Omit to create a new hook; pass one to edit it. */
  hook?: Hook;
  onClose: () => void;
  onSubmit: (draft: HookDraft) => void;
  /** Edit mode only: delete this hook (its id is owned by the caller). */
  onDelete?: () => void;
}

/**
 * Create/edit dialog for a hook (the AgentDetailModal pattern, controlled
 * inputs): an id (create only), name, lifecycle-event dropdown, a matcher
 * (tool-scoped events only), the shell command, an optional timeout and an
 * enabled toggle. On submit it emits the create/update payload; the screen wires
 * the mutation.
 */
export function HookFormDialog({ hook, onClose, onSubmit, onDelete }: HookFormDialogProps) {
  const t = useTranslations();
  const isNew = hook === undefined;

  const [id, setId] = useState(hook?.id ?? "");
  const [name, setName] = useState(hook?.name ?? "");
  const [event, setEvent] = useState<HookEvent>(hook?.event ?? "PreToolUse");
  const [matcher, setMatcher] = useState(hook?.matcher ?? "");
  const [command, setCommand] = useState(hook?.command ?? "");
  const [timeout, setTimeout] = useState(hook?.timeout != null ? String(hook.timeout) : "");
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);

  const showMatcher = MATCHER_EVENTS.has(event);

  const canSave =
    (isNew ? id.trim().length > 0 : true) && command.trim().length > 0;

  const submit = () => {
    const parsedTimeout = Number.parseInt(timeout.trim(), 10);
    const safeTimeout =
      Number.isInteger(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : undefined;
    const safeMatcher = showMatcher ? matcher.trim() || undefined : undefined;
    if (isNew) {
      onSubmit({
        create: {
          id: id.trim(),
          name: name.trim() || undefined,
          event,
          matcher: safeMatcher,
          command: command.trim(),
          timeout: safeTimeout,
          enabled,
        },
      });
    } else {
      onSubmit({
        update: {
          id: hook.id,
          patch: {
            name: name.trim() || undefined,
            event,
            matcher: safeMatcher,
            command: command.trim(),
            timeout: safeTimeout,
            enabled,
          },
        },
      });
    }
  };

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
            data-testid={HookFormTestId.Submit}
            disabled={!canSave}
            icon={isNew ? "plus" : "check"}
            intent="primary"
            onClick={submit}
          >
            {isNew ? t("hooks.create") : t("common.save")}
          </Button>
        </>
      }
      ariaLabel={isNew ? t("hooks.addHook") : (hook.name ?? hook.id)}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={isNew ? t("hooks.addHook") : (hook.name ?? hook.id)}
      width="lg"
    >
      <Stack direction="col" gap="150">
        {isNew ? (
          <TextInputField
            data-testid={HookFormTestId.Id}
            label={t("hooks.idLabel")}
            onChange={(e) => setId(e.target.value)}
            placeholder="audit-log"
            value={id}
          />
        ) : (
          <Field label={t("hooks.idLabel")}>
            {() => (
              <Typography mono data-testid={HookFormTestId.Id} size="base" type="note">
                {hook.id}
              </Typography>
            )}
          </Field>
        )}

        <TextInputField
          data-testid={HookFormTestId.Name}
          label={t("hooks.nameLabel")}
          onChange={(e) => setName(e.target.value)}
          value={name}
        />

        <SelectField
          data-testid={HookFormTestId.Event}
          label={t("hooks.eventLabel")}
          onValueChange={(v) => setEvent(v as HookEvent)}
          options={HOOK_EVENTS.map((e) => ({ value: e, label: e }))}
          value={event}
        />

        {showMatcher && (
          <TextInputField
            data-testid={HookFormTestId.Matcher}
            hint={t("hooks.matcherHint")}
            label={t("hooks.matcherLabel")}
            onChange={(e) => setMatcher(e.target.value)}
            placeholder="Bash"
            value={matcher}
          />
        )}

        <TextInputField
          data-testid={HookFormTestId.Command}
          hint={t("hooks.commandHint")}
          label={t("hooks.commandLabel")}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="./scripts/audit.sh"
          value={command}
        />

        <TextInputField
          data-testid={HookFormTestId.Timeout}
          hint={t("hooks.timeoutHint")}
          label={t("hooks.timeoutLabel")}
          onChange={(e) => setTimeout(e.target.value)}
          type="number"
          value={timeout}
        />

        <ToggleField checked={enabled} label={t("hooks.enabledLabel")} onChange={setEnabled} />
      </Stack>
    </Dialog>
  );
}
