"use client";

import type { TodoItem } from "@zibby/contracts";
import { BoardRow, BoardText, Button, Container, Stack } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useMemo, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { CommandLine, type ScopeKind } from "../../tasks/components/CommandLine/CommandLine";
import { useCreateTodoMutation, useDeleteTodoMutation } from "../../todo/mutations";
import { useTodoQuery } from "../../todo/queries";
import { todoTaskTitle } from "../../todo/todoTaskTitle";
import type { BridgeWidgetProps } from "./registry";

export enum TodoWidgetTestId {
  Add = "todo-widget-add",
  Implement = "todo-widget-implement",
  Delete = "todo-widget-delete",
}

/** `#` offers the same scope kinds as the chat composer. */
const TODO_SCOPE_KINDS: readonly ScopeKind[] = ["company", "team", "project"];

/**
 * TODO: the operator's quick notes (`/api/todo`) — rows (oldest first) above a chat-style
 * composer (`@` agents/workflows/departments, `#` company/team/project, `/` skills). The mention
 * tokens stay in the note's text. Implement opens `/work/tasks/new` prefilled; the task created
 * there removes the note server-side.
 */
export function TodoWidget({ widget, onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.todo");
  const now = useNow(60_000);
  const router = useRouter();
  const query = useTodoQuery();
  const create = useCreateTodoMutation();
  const remove = useDeleteTodoMutation();
  // Bumped on a SUCCESSFUL add to remount (clear) the composer; a failed POST keeps the text.
  const [composerKey, setComposerKey] = useState(0);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const loading = query.isPending;
  const count = loading ? undefined : items.length;
  // Never empty: the composer is always available.
  useEffect(() => onEmptyChange(false), [onEmptyChange]);
  useEffect(() => onCountChange?.({ count, you: 0, loading }), [count, loading, onCountChange]);

  const implement = (e: MouseEvent, item: TodoItem) => {
    e.stopPropagation();
    const q = new URLSearchParams({
      text: item.text,
      title: todoTaskTitle(item.text),
      todo: item.id,
    });
    router.push(`/work/tasks/new?${q.toString()}` as Route);
  };

  return (
    <>
      {items.map((item) => (
        <BoardRow
          action={
            <Stack direction="row" gap="100">
              <Button
                aria-label={t("implementLabel", { name: item.text })}
                data-testid={TodoWidgetTestId.Implement}
                icon="play"
                intent="ghost"
                onClick={(e) => implement(e, item)}
                size="sm"
              />
              <Button
                aria-label={t("deleteLabel", { name: item.text })}
                data-testid={TodoWidgetTestId.Delete}
                icon="trash"
                intent="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate({ params: { id: item.id } });
                }}
                size="sm"
              />
            </Stack>
          }
          key={item.id}
          rowKey={`${widget.id}:${item.id}`}
          tone="idle"
        >
          <BoardText kind="title">{item.text}</BoardText>
          <BoardText kind="meta" tone="ink3">
            {compactAgo(item.createdAt, now)}
          </BoardText>
        </BoardRow>
      ))}
      <Container padding={["100", "150"]}>
        <CommandLine
          allowSkillMentions
          hideLabel
          multipleTargets
          chrome={false}
          key={composerKey}
          label={t("input")}
          onSubmit={(text) => {
            const trimmed = text.trim();
            if (trimmed && !create.isPending)
              create.mutate(
                { body: { text: trimmed } },
                { onSuccess: () => setComposerKey((k) => k + 1) },
              );
          }}
          placeholder={t("placeholder")}
          renderTrailing={({ canSubmit, submit }) => (
            <Button
              data-testid={TodoWidgetTestId.Add}
              disabled={!canSubmit || create.isPending}
              intent="secondary"
              onClick={submit}
              size="sm"
            >
              {t("add")}
            </Button>
          )}
          resetOnSubmit={false}
          scopeKinds={TODO_SCOPE_KINDS}
          showAttach={false}
        />
      </Container>
    </>
  );
}
