"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  GlassSurface,
  Icon,
  type IconName,
  IconTile,
  Pressable,
  SelectField,
  Stack,
  TextAreaField,
} from "@zibby/design-system";
import { type CreateTaskResult, DEPARTMENTS, type DepartmentId } from "@zibby/contracts";
import { type TaskTarget, toApiTarget } from "../../tasks/task";
import { useCreateTaskMutation } from "../../tasks/mutations";

export enum ChatQuickTaskTestId {
  Root = "chat-quick-task",
  Department = "chat-quick-task-department",
  Text = "chat-quick-task-text",
  Run = "chat-quick-task-run",
  Close = "chat-quick-task-close",
}

export interface ChatQuickTaskProps {
  onClose: () => void;
  /** Called with the created task result, mirroring `ChatQuickNote`'s `onSaved`. */
  onCreated?: (result: CreateTaskResult) => void;
}

/**
 * One glyph per department identity for the composer's header icon tile —
 * mirrors `DepartmentOrbMap`'s own `ICON_MAP` (kept as a local duplicate here:
 * that map isn't exported, and this component is a standalone unit per the
 * task brief — no cross-file wiring beyond the documented reuse targets).
 */
const DEPARTMENT_GLYPH: Record<DepartmentId, IconName> = {
  dev: "code",
  com: "link",
  sec: "shield",
  rnd: "compass",
  rel: "checkpoint",
  inc: "warn",
  ops: "pulse",
  qa: "search",
  knw: "brain",
  fin: "dollar",
  per: "coffee",
};

/**
 * Velín-D bottom-bar "run a task" composer (`VcQuickTask`) — the chat sibling
 * of `ChatQuickNote`, wired to the existing task-create flow instead of notes.
 * Reuses `toApiTarget` to project a locally-built `{ kind: "department" }`
 * target onto the wire shape `useCreateTaskMutation` posts — this bypasses
 * classification (Phase 91 explicit dispatch), letting the scheduler resolve
 * straight to the chosen department's owned pipeline.
 *
 * Standalone unit — the bottom bar (T4/T6) owns mount/unmount and the expand/
 * collapse choreography; this component only knows how to run a task and call
 * `onClose`.
 */
export function ChatQuickTask({ onClose, onCreated }: ChatQuickTaskProps) {
  const t = useTranslations("chat.task");
  const createMut = useCreateTaskMutation();

  const [departmentId, setDepartmentId] = useState<DepartmentId>(DEPARTMENTS[0]!.id);
  const [text, setText] = useState("");

  // DEPARTMENTS is a fixed non-empty registry (8 entries) — the `!` mirrors the
  // same known-non-empty assertion `DepartmentDrawer`'s and `DepartmentOrbMap`'s
  // own tests use for `DEPARTMENTS[0]`.
  const selected = DEPARTMENTS.find((s) => s.id === departmentId) ?? DEPARTMENTS[0]!;
  const canRun = text.trim().length > 0;

  const run = () => {
    const localTarget: TaskTarget = {
      kind: "department",
      id: selected.id,
      name: selected.name,
      glyph: DEPARTMENT_GLYPH[selected.id],
    };
    createMut.mutate(
      { body: { text, target: toApiTarget(localTarget) } },
      {
        onSuccess: (result) => {
          onCreated?.(result.body);
          onClose();
        },
      },
    );
  };

  return (
    <GlassSurface data-testid={ChatQuickTaskTestId.Root} radius="panel">
      <Container padding="200">
        <Stack gap="150">
          <Stack align="center" direction="row" gap="100">
            <IconTile
              glyph={DEPARTMENT_GLYPH[selected.id]}
              size="sm"
              style={{
                background: `${selected.color}18`,
                borderColor: `${selected.color}44`,
                color: selected.color,
              }}
            />
            <Container grow data-testid={ChatQuickTaskTestId.Department}>
              <SelectField
                label={t("departmentLabel")}
                onValueChange={(v) => setDepartmentId(v as DepartmentId)}
                options={DEPARTMENTS.map((s) => ({ value: s.id, label: s.name }))}
                value={departmentId}
              />
            </Container>
            <Pressable
              aria-label={t("close")}
              data-testid={ChatQuickTaskTestId.Close}
              onClick={onClose}
              title={t("close")}
            >
              <Icon name="x" size="xs" />
            </Pressable>
          </Stack>
          <TextAreaField
            autoFocus
            data-testid={ChatQuickTaskTestId.Text}
            label={t("textLabel")}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            rows={2}
            value={text}
          />
          <Button
            block
            data-testid={ChatQuickTaskTestId.Run}
            disabled={!canRun}
            icon="play"
            loading={createMut.isPending}
            onClick={run}
          >
            {t("run")}
          </Button>
        </Stack>
      </Container>
    </GlassSurface>
  );
}
