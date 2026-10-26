"use client";

import type { QuickAction, QuickActionTarget } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  BoardText,
  Button,
  Container,
  Dropdown,
  Stack,
  TextInputField,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAgentsQuery } from "../../agents/queries";
import { useSetQuickActionsMutation } from "../../quick-actions/mutations";
import { getQuickActionsQueryKey, useQuickActionsQuery } from "../../quick-actions/queries";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";
import { useCreateTaskMutation } from "../../tasks/mutations";
import { useWorkflowsQuery } from "../../workflows/queries";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum QuickActionsWidgetTestId {
  Run = "quick-actions-run",
  Remove = "quick-actions-remove",
  Label = "quick-actions-label",
  Text = "quick-actions-text",
  Target = "quick-actions-target",
  Add = "quick-actions-add",
  Form = "quick-actions-form",
}

const newId = () => `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Quick actions: operator-saved one-click tasks. Run enqueues the stored task straight into
 * the run queue (createTask); in edit mode a row offers Remove and an add form appears below.
 */
export function QuickActionsWidget({
  widget,
  editing,
  onEmptyChange,
  onCountChange,
}: BridgeWidgetProps) {
  const query = useQuickActionsQuery();
  const agentsQuery = useAgentsQuery();
  const workflowsQuery = useWorkflowsQuery();
  const set = useSetQuickActionsMutation();
  const queryClient = useQueryClient();
  const actions = useMemo(() => query.data ?? [], [query.data]);
  const agents = agentsQuery.data;
  const workflows = workflowsQuery.data;

  useWidgetReport(
    { loading: query.isPending, count: actions.length, you: 0 },
    { onEmptyChange, onCountChange },
  );

  /** Apply `change` to the latest cached list (not the possibly stale rendered one) and PUT it. */
  const update: UpdateActions = (change, onSuccess) => {
    const cached = queryClient.getQueryData<{ body: QuickAction[] }>(getQuickActionsQueryKey());
    set.mutate({ body: change(cached?.body ?? actions) }, { onSuccess });
  };

  return (
    <>
      {actions.map((a) => (
        <QuickActionRow
          action={a}
          agents={agents}
          editing={editing}
          key={a.id}
          pending={set.isPending}
          rowKey={`${widget.id}:${a.id}`}
          update={update}
          workflows={workflows}
        />
      ))}
      {editing ? (
        <QuickActionAdd
          agents={agents ?? []}
          full={actions.length >= MAX_ACTIONS}
          pending={set.isPending}
          update={update}
          workflows={workflows ?? []}
        />
      ) : null}
    </>
  );
}

type UpdateActions = (
  change: (latest: QuickAction[]) => QuickAction[],
  onSuccess?: () => void,
) => void;

type NamedEntity = { id: string; name?: string | undefined };

/** Visible hide of the "Queued" hint after a run. */
const QUEUED_MS = 5000;
const MAX_ACTIONS = 50;
const MAX_TEXT = 8000;

interface QuickActionRowProps {
  action: QuickAction;
  agents: NamedEntity[] | undefined;
  workflows: NamedEntity[] | undefined;
  editing: boolean;
  pending: boolean;
  rowKey: string;
  update: UpdateActions;
}

function QuickActionRow({
  action: a,
  agents,
  workflows,
  editing,
  pending,
  rowKey,
  update,
}: QuickActionRowProps) {
  const t = useTranslations("bridge.widgets.quickActions");
  const create = useCreateTaskMutation();
  const [queued, setQueued] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // The stored target name may be stale: prefer the live catalog entry; once both catalogs
  // have loaded, a target that is gone disables Run.
  const catalog = a.target?.kind === "workflow" ? workflows : agents;
  const live = a.target ? catalog?.find((x) => x.id === a.target?.id) : undefined;
  const loaded = agents !== undefined && workflows !== undefined;
  const missing = a.target !== undefined && loaded && !live;
  const target: QuickActionTarget | undefined =
    a.target && live ? { ...a.target, name: live.name ?? a.target.name } : a.target;

  const run = () => {
    clearTimeout(timer.current);
    setQueued(false);
    create.mutate(
      { body: { title: a.label, text: a.text, ...(target ? { target } : {}) } },
      {
        onSuccess: () => {
          setQueued(true);
          timer.current = setTimeout(() => setQueued(false), QUEUED_MS);
        },
      },
    );
  };

  return (
    <BoardRow
      action={
        editing ? (
          <Button
            aria-label={t("removeLabel", { label: a.label })}
            data-testid={QuickActionsWidgetTestId.Remove}
            disabled={pending}
            icon="trash"
            intent="ghost"
            onClick={() => update((latest) => latest.filter((x) => x.id !== a.id))}
            size="sm"
          >
            {t("remove")}
          </Button>
        ) : (
          <Button
            aria-label={t("runLabel", { label: a.label })}
            data-testid={QuickActionsWidgetTestId.Run}
            disabled={create.isPending || missing}
            icon="play"
            intent="ghost"
            onClick={run}
            size="sm"
          >
            {t("run")}
          </Button>
        )
      }
      rowKey={rowKey}
      tone="idle"
    >
      <BoardText kind="title">{a.label}</BoardText>
      <BoardLine gap="6" indent={false}>
        <BoardText kind="meta" tone="ink3">
          {queued ? t("queued") : missing ? t("targetMissing") : (target?.name ?? t("auto"))}
        </BoardText>
      </BoardLine>
    </BoardRow>
  );
}

interface QuickActionAddProps {
  agents: NamedEntity[];
  workflows: NamedEntity[];
  full: boolean;
  pending: boolean;
  update: UpdateActions;
}

function QuickActionAdd({ agents, workflows, full, pending, update }: QuickActionAddProps) {
  const t = useTranslations("bridge.widgets.quickActions");
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  // Bumped after a successful add to remount (and so clear) the CommandLine.
  const [textKey, setTextKey] = useState(0);
  const [choice, setChoice] = useState("");

  const { options, targets } = useMemo(() => {
    const targets = new Map<string, QuickActionTarget>();
    const opts = [{ value: "", label: t("auto") }];
    for (const a of agents) {
      const name = a.name ?? a.id;
      targets.set(`agent:${a.id}`, { kind: "agent", id: a.id, name });
      opts.push({ value: `agent:${a.id}`, label: name });
    }
    for (const w of workflows) {
      const name = w.name ?? w.id;
      targets.set(`workflow:${w.id}`, { kind: "workflow", id: w.id, name });
      opts.push({ value: `workflow:${w.id}`, label: name });
    }
    return { options: opts, targets };
  }, [agents, workflows, t]);

  const blank = !label.trim() || !text.trim() || text.length > MAX_TEXT || full;

  /** Add the action; `body` overrides the mirrored `text` when Enter in the CommandLine submits. */
  const add = (body: string) => {
    if (!label.trim() || !body.trim() || body.length > MAX_TEXT || full || pending) return;
    const target = targets.get(choice);
    update(
      (latest) => [
        ...latest,
        { id: newId(), label: label.trim(), text: body.trim(), ...(target ? { target } : {}) },
      ],
      () => {
        setLabel("");
        setText("");
        setTextKey((k) => k + 1);
        setChoice("");
      },
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add(text);
  };

  return (
    <Container
      as="form"
      data-testid={QuickActionsWidgetTestId.Form}
      onSubmit={submit}
      padding={["100", "150"]}
    >
      <Stack gap="100">
        <TextInputField
          hideLabel
          data-testid={QuickActionsWidgetTestId.Label}
          label={t("label")}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("labelPlaceholder")}
          value={label}
        />
        <Container data-testid={QuickActionsWidgetTestId.Text}>
          <CommandLine
            allowSkillMentions
            chrome={false}
            key={textKey}
            label={t("text")}
            onSubmit={add}
            onTextChange={setText}
            placeholder={t("textPlaceholder")}
            renderTrailing={() => null}
            resetOnSubmit={false}
            showAttach={false}
          />
        </Container>
        <Stack align="center" direction="row" gap="100">
          <Stack data-testid={QuickActionsWidgetTestId.Target}>
            <Dropdown
              aria-label={t("target")}
              onChange={setChoice}
              options={options}
              value={choice}
            />
          </Stack>
          <Button
            data-testid={QuickActionsWidgetTestId.Add}
            disabled={blank || pending}
            intent="secondary"
            loading={pending}
            type="submit"
          >
            {t("add")}
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
