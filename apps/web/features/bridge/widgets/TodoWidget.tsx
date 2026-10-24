"use client";

import type { TodoItem } from "@zibby/contracts";
import {
  BoardRow,
  BoardText,
  Button,
  Container,
  Stack,
  TextInputField,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useCreateTodoMutation, useDeleteTodoMutation } from "../../todo/mutations";
import { useTodoQuery } from "../../todo/queries";
import type { BridgeWidgetProps } from "./registry";

export enum TodoWidgetTestId {
  Input = "todo-widget-input",
  Add = "todo-widget-add",
  Implement = "todo-widget-implement",
  Delete = "todo-widget-delete",
}

/**
 * TODO: the operator's quick notes (`/api/todo`). Interim minimal shape — the full
 * composer with mentions is Task 2. Implement opens `/work/tasks/new` prefilled.
 */
export function TodoWidget({ widget, onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.todo");
  const now = useNow(60_000);
  const router = useRouter();
  const query = useTodoQuery();
  const create = useCreateTodoMutation();
  const remove = useDeleteTodoMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const loading = query.isPending;
  const count = loading ? undefined : items.length;
  useEffect(() => onEmptyChange(false), [onEmptyChange]);
  useEffect(() => onCountChange?.({ count, you: 0, loading }), [count, loading, onCountChange]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || create.isPending) return;
    create.mutate(
      { body: { text: trimmed } },
      {
        onSuccess: () => {
          setText("");
          inputRef.current?.focus();
        },
      },
    );
  };

  const implement = (e: MouseEvent, item: TodoItem) => {
    e.stopPropagation();
    const q = new URLSearchParams({
      text: item.text,
      title: item.text.slice(0, 80),
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
              >
                {t("implement")}
              </Button>
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
      <Container as="form" onSubmit={submit} padding={["100", "150"]}>
        <Stack align="center" direction="row" gap="100">
          <Container grow minW0>
            <TextInputField
              hideLabel
              data-testid={TodoWidgetTestId.Input}
              label={t("input")}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholder")}
              ref={inputRef}
              value={text}
            />
          </Container>
          <Button
            data-testid={TodoWidgetTestId.Add}
            disabled={!text.trim()}
            intent="secondary"
            loading={create.isPending}
            type="submit"
          >
            {t("add")}
          </Button>
        </Stack>
      </Container>
    </>
  );
}
