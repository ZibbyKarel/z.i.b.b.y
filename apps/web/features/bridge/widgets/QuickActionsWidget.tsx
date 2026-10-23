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
  TextAreaField,
  TextInputField,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";
import { useAgentsQuery } from "../../agents/queries";
import { useSetQuickActionsMutation } from "../../quick-actions/mutations";
import { useQuickActionsQuery } from "../../quick-actions/queries";
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
  const actions = useMemo(() => query.data ?? [], [query.data]);

  useWidgetReport(
    { loading: query.isPending, count: actions.length, you: 0 },
    { onEmptyChange, onCountChange },
  );

  return (
    <>
      {actions.map((a) => (
        <QuickActionRow
          action={a}
          actions={actions}
          editing={editing}
          key={a.id}
          rowKey={`${widget.id}:${a.id}`}
        />
      ))}
      {editing ? <QuickActionAdd actions={actions} /> : null}
    </>
  );
}

interface QuickActionRowProps {
  action: QuickAction;
  actions: QuickAction[];
  editing: boolean;
  rowKey: string;
}

function QuickActionRow({ action: a, actions, editing, rowKey }: QuickActionRowProps) {
  const t = useTranslations("bridge.widgets.quickActions");
  const create = useCreateTaskMutation();
  const set = useSetQuickActionsMutation();
  const [queued, setQueued] = useState(false);

  const run = () => {
    setQueued(false);
    create.mutate(
      { body: { title: a.label, text: a.text, ...(a.target ? { target: a.target } : {}) } },
      { onSuccess: () => setQueued(true) },
    );
  };

  return (
    <BoardRow
      action={
        editing ? (
          <Button
            aria-label={t("removeLabel", { label: a.label })}
            data-testid={QuickActionsWidgetTestId.Remove}
            disabled={set.isPending}
            icon="trash"
            intent="ghost"
            onClick={() => set.mutate({ body: actions.filter((x) => x.id !== a.id) })}
            size="sm"
          >
            {t("remove")}
          </Button>
        ) : (
          <Button
            aria-label={t("runLabel", { label: a.label })}
            data-testid={QuickActionsWidgetTestId.Run}
            disabled={create.isPending}
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
          {queued ? t("queued") : (a.target?.name ?? t("auto"))}
        </BoardText>
      </BoardLine>
    </BoardRow>
  );
}

interface QuickActionAddProps {
  actions: QuickAction[];
}

function QuickActionAdd({ actions }: QuickActionAddProps) {
  const t = useTranslations("bridge.widgets.quickActions");
  const agentsQuery = useAgentsQuery();
  const workflowsQuery = useWorkflowsQuery();
  const set = useSetQuickActionsMutation();
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");

  const { options, targets } = useMemo(() => {
    const targets = new Map<string, QuickActionTarget>();
    const opts = [{ value: "", label: t("auto") }];
    for (const a of agentsQuery.data ?? []) {
      const name = a.name ?? a.id;
      targets.set(`agent:${a.id}`, { kind: "agent", id: a.id, name });
      opts.push({ value: `agent:${a.id}`, label: name });
    }
    for (const w of workflowsQuery.data ?? []) {
      targets.set(`workflow:${w.id}`, { kind: "workflow", id: w.id, name: w.name });
      opts.push({ value: `workflow:${w.id}`, label: w.name });
    }
    return { options: opts, targets };
  }, [agentsQuery.data, workflowsQuery.data, t]);

  const blank = !label.trim() || !text.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blank) return;
    const target = targets.get(choice);
    set.mutate(
      {
        body: [
          ...actions,
          { id: newId(), label: label.trim(), text: text.trim(), ...(target ? { target } : {}) },
        ],
      },
      {
        onSuccess: () => {
          setLabel("");
          setText("");
          setChoice("");
        },
      },
    );
  };

  return (
    <Container as="form" onSubmit={submit} padding={["100", "150"]}>
      <Stack gap="100">
        <TextInputField
          hideLabel
          data-testid={QuickActionsWidgetTestId.Label}
          label={t("label")}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("labelPlaceholder")}
          value={label}
        />
        <TextAreaField
          data-testid={QuickActionsWidgetTestId.Text}
          label={t("text")}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("textPlaceholder")}
          value={text}
        />
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
            disabled={blank}
            intent="secondary"
            loading={set.isPending}
            type="submit"
          >
            {t("add")}
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
