"use client";

import type { QuickAction, QuickActionTarget } from "@zibby/contracts";
import { BoardLine, BoardRow, BoardText, Button } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentsQuery } from "../../agents/queries";
import { useResolvedQuickActions } from "../../quick-actions/useResolvedQuickActions";
import {
  type UpdateQuickActions,
  useUpdateQuickActions,
} from "../../quick-actions/useUpdateQuickActions";
import { useCreateTaskMutation } from "../../tasks/mutations";
import { useWorkflowsQuery } from "../../workflows/queries";
import { type NamedEntity, QuickActionForm } from "./QuickActionForm";
import type { BridgeWidgetProps } from "./registry";
import { useWidgetReport } from "./useWidgetReport";

export enum QuickActionsWidgetTestId {
  Run = "quick-actions-run",
  Remove = "quick-actions-remove",
}

const newId = () => `qa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Quick actions: operator-saved one-click tasks. Run enqueues the stored task straight into
 * the run queue (createTask); while the header `+` toggle is on, a row offers Remove and an add form appears below.
 */
export function QuickActionsWidget({
  widget,
  adding,
  onEmptyChange,
  onCountChange,
  selection,
  onOpen,
  sheetSide,
}: BridgeWidgetProps) {
  const query = useResolvedQuickActions();
  const agentsQuery = useAgentsQuery();
  const workflowsQuery = useWorkflowsQuery();
  const t = useTranslations("bridge.widgets.quickActions");
  const actions = useMemo(() => query.data ?? [], [query.data]);
  const agents = agentsQuery.data;
  const workflows = workflowsQuery.data;
  const { update, pending } = useUpdateQuickActions(actions);

  useWidgetReport(
    { loading: query.isPending, count: actions.length, you: 0 },
    { onEmptyChange, onCountChange },
  );

  return (
    <>
      {actions.map((a) => (
        <QuickActionRow
          action={a}
          adding={adding}
          agents={agents}
          key={a.id}
          onOpen={() =>
            onOpen({
              kind: "quickAction",
              id: a.id,
              widgetId: widget.id,
              key: `${widget.id}:${a.id}`,
            })
          }
          pending={pending}
          rowKey={`${widget.id}:${a.id}`}
          selected={selection?.key === `${widget.id}:${a.id}`}
          sheetSide={sheetSide}
          update={update}
          workflows={workflows}
        />
      ))}
      {adding ? (
        <QuickActionForm
          agents={agents ?? []}
          disabled={actions.length >= MAX_ACTIONS}
          onSubmit={(values, done) =>
            update((latest) => [...latest, { id: newId(), ...values }], done)
          }
          pending={pending}
          submitLabel={t("add")}
          workflows={workflows ?? []}
        />
      ) : null}
    </>
  );
}

/** Visible hide of the "Queued" hint after a run. */
const QUEUED_MS = 5000;
const MAX_ACTIONS = 50;

interface QuickActionRowProps {
  action: QuickAction;
  agents: NamedEntity[] | undefined;
  workflows: NamedEntity[] | undefined;
  adding: boolean;
  pending: boolean;
  rowKey: string;
  selected: boolean;
  sheetSide: BridgeWidgetProps["sheetSide"];
  onOpen: () => void;
  update: UpdateQuickActions;
}

function QuickActionRow({
  action: a,
  agents,
  workflows,
  adding,
  pending,
  rowKey,
  selected,
  sheetSide,
  onOpen,
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
      {
        body: {
          title: a.label,
          text: a.text,
          ...(target ? { target } : {}),
          ...(a.immediate ? { immediate: true } : {}),
        },
      },
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
        adding ? (
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
      onClick={adding ? undefined : onOpen}
      rowKey={rowKey}
      selected={selected}
      sheetSide={sheetSide}
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
