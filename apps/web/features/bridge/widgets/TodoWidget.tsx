"use client";

import type { InboxRoadmapItem, RoadmapItemLifecycle } from "@zibby/contracts";
import {
  BoardLine,
  BoardRow,
  type BoardRowTone,
  BoardText,
  Button,
  Container,
  Dropdown,
  Stack,
  TextInputField,
} from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type FormEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNow } from "../../../hooks/useNow";
import { compactAgo } from "../../../utils/time";
import { useTodoItemsQuery } from "../../inbox/queries";
import { useProjectsQuery } from "../../projects/queries";
import { useCreateRoadmapItemMutation, usePlayRoadmapItemMutation } from "../../roadmap/mutations";
import type { BridgeWidgetProps } from "./registry";

export enum TodoWidgetTestId {
  Input = "todo-widget-input",
  Target = "todo-widget-target",
  Add = "todo-widget-add",
  Implement = "todo-widget-implement",
  NoProjects = "todo-widget-no-projects",
}

/** Per-viewer memory of the last chosen target project (a convenience, never required). */
export const TODO_TARGET_STORAGE_KEY = "zibby.bridge.todo.target";

/** The lifecycles the TODO list can carry (the API drops `archived` and `done`). */
type OpenLifecycle = Exclude<RoadmapItemLifecycle, "archived" | "done">;

const TONE: Record<OpenLifecycle, BoardRowTone> = {
  todo: "idle",
  enqueued: "thinking",
  running: "working",
  failed: "error",
  "awaiting-merge": "blocked",
  external: "neutral",
};

function readStoredTarget(): string | null {
  try {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(TODO_TARGET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredTarget(projectId: string) {
  try {
    window.localStorage.setItem(TODO_TARGET_STORAGE_KEY, projectId);
  } catch {
    // Storage blocked (private window, denied site data) — the choice just isn't remembered.
  }
}

const isOpen = (lifecycle: RoadmapItemLifecycle): lifecycle is OpenLifecycle =>
  lifecycle !== "archived" && lifecycle !== "done";

/**
 * TODO: quick-add of manual roadmap tasks ("položky k implementaci") into a chosen target
 * project, above the open manual tasks of every project (newest first). A `todo` row offers
 * Implement (plays the item); a row click opens the project's roadmap. The widget never
 * collapses while the quick-add form is available — only with no projects and no items.
 */
export function TodoWidget({ widget, onEmptyChange, onCountChange }: BridgeWidgetProps) {
  const t = useTranslations("bridge.widgets.todo");
  const now = useNow(60_000);
  const todoQuery = useTodoItemsQuery();
  const projectsQuery = useProjectsQuery();

  const items = useMemo(() => todoQuery.data?.items ?? [], [todoQuery.data]);
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const loading = todoQuery.isPending;

  const empty = !loading && !projectsQuery.isPending && items.length === 0 && projects.length === 0;
  const count = loading ? undefined : items.length;
  useEffect(() => onEmptyChange(empty), [empty, onEmptyChange]);
  useEffect(() => onCountChange?.({ count, you: 0, loading }), [count, loading, onCountChange]);

  return (
    <>
      {projects.length > 0 ? (
        <TodoQuickAdd projects={projects} />
      ) : projectsQuery.isPending ? null : (
        <BoardRow tone="neutral">
          <span data-testid={TodoWidgetTestId.NoProjects}>
            <BoardText kind="meta" tone="ink3">
              {t("noProjects")}
            </BoardText>
          </span>
        </BoardRow>
      )}
      {items.map((item) => (
        <TodoRow
          age={compactAgo(item.createdAt, now)}
          item={item}
          key={`${item.projectId}/${item.id}`}
          rowKey={`${widget.id}:${item.projectId}/${item.id}`}
        />
      ))}
    </>
  );
}

interface TodoQuickAddProps {
  projects: { id: string; name: string }[];
}

/** The quick-add line: text · target project · Add. Enter submits; blank text never does. */
function TodoQuickAdd({ projects }: TodoQuickAddProps) {
  const t = useTranslations("bridge.widgets.todo");
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [stored, setStored] = useState<string | null>(readStoredTarget);
  // A remembered project that no longer exists falls back to the first one.
  const target = projects.some((p) => p.id === stored) ? (stored as string) : projects[0]?.id;
  const create = useCreateRoadmapItemMutation(target ?? "");

  const options = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name })), [projects]);

  const choose = (projectId: string) => {
    setStored(projectId);
    writeStoredTarget(projectId);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !target || create.isPending) return;
    create.mutate(
      { params: { projectId: target }, body: { level: "task", name: trimmed } },
      {
        onSuccess: () => {
          setName("");
          inputRef.current?.focus();
        },
      },
    );
  };

  return (
    <Container as="form" onSubmit={submit} padding={["100", "150"]}>
      <Stack align="center" direction="row" gap="100">
        <Container grow minW0>
          <TextInputField
            hideLabel
            data-testid={TodoWidgetTestId.Input}
            label={t("input")}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("placeholder")}
            ref={inputRef}
            value={name}
          />
        </Container>
        {target ? (
          <Stack data-testid={TodoWidgetTestId.Target}>
            <Dropdown aria-label={t("target")} onChange={choose} options={options} value={target} />
          </Stack>
        ) : null}
        <Button
          data-testid={TodoWidgetTestId.Add}
          disabled={!name.trim()}
          intent="secondary"
          loading={create.isPending}
          type="submit"
        >
          {t("add")}
        </Button>
      </Stack>
    </Container>
  );
}

interface TodoRowProps {
  item: InboxRoadmapItem;
  rowKey: string;
  age: string;
}

/**
 * One TODO row. Its own component so each row binds `usePlayRoadmapItemMutation` to its own
 * project. The Implement button is the row's `action` (its own slot beside the row button —
 * a button can't contain a button) and never triggers the row's navigation.
 */
function TodoRow({ item, rowKey, age }: TodoRowProps) {
  const t = useTranslations("bridge.widgets.todo");
  const router = useRouter();
  const play = usePlayRoadmapItemMutation(item.projectId);
  const lifecycle = isOpen(item.lifecycle) ? item.lifecycle : null;

  const implement = (e: MouseEvent) => {
    e.stopPropagation();
    play.mutate({ params: { projectId: item.projectId, itemId: item.id }, body: {} });
  };

  return (
    <BoardRow
      action={
        lifecycle === "todo" ? (
          <Button
            aria-label={t("implementLabel", { name: item.name })}
            data-testid={TodoWidgetTestId.Implement}
            disabled={play.isPending}
            icon="play"
            intent="ghost"
            onClick={implement}
            size="sm"
          >
            {t("implement")}
          </Button>
        ) : undefined
      }
      onClick={() => router.push(`/projects/${item.projectId}/roadmap` as Route)}
      rowKey={rowKey}
      tone={lifecycle ? TONE[lifecycle] : "neutral"}
    >
      <BoardText kind="title">{item.name}</BoardText>
      <BoardLine
        end={
          <BoardText kind="meta" tone="ink3">
            {age}
          </BoardText>
        }
        gap="6"
        indent={false}
      >
        <BoardText kind="meta" tone="ink">
          {lifecycle ? t(`state.${lifecycle}`) : item.lifecycle}
        </BoardText>
        <BoardText kind="meta" tone="ink3">
          · {item.project.name}
        </BoardText>
      </BoardLine>
    </BoardRow>
  );
}
