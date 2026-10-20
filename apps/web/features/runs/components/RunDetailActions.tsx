"use client";

import {
  Button,
  Container,
  MenuButton,
  type MenuButtonItem,
  Stack,
  StatusDot,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDeleteDialog } from "../../../components/ConfirmDeleteDialog/ConfirmDeleteDialog";
import { type RunView, isCancellableRun } from "../run";
import type { RunMode } from "../runDetailModel";
import type { ResumeRunOptions } from "../useRunActions";

export enum RunDetailActionsTestId {
  Root = "run-detail-actions",
  /** Suffixed with the action id, e.g. `run-detail-action-stop`. */
  Action = "run-detail-action",
  More = "run-detail-more",
}

export interface RunDetailActionsProps {
  run: RunView;
  mode: RunMode;
  /** Named in the STOP confirm body. */
  currentStageName?: string;
  /** The agent working the run — enables the ··· menu's OPEN AGENT row. */
  agentId?: string;
  onPause: () => void;
  onResume: (opts?: ResumeRunOptions) => void;
  onStop: () => void;
  onDelete: () => void;
  onContinueTask: () => void;
  onOpenFolder?: () => void;
  pending: boolean;
}

type ActionId =
  | "pause"
  | "pausing"
  | "resume"
  | "stop"
  | "rerunFresh"
  | "continueSession"
  | "rerun"
  | "continueTask";

interface ActionSpec {
  id: ActionId;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The header's mode-dependent buttons (primary last) plus the ··· overflow menu.
 * STOP and DELETE confirm through `ConfirmDeleteDialog` before anything fires.
 */
export function RunDetailActions({
  run,
  mode,
  currentStageName,
  agentId,
  onPause,
  onResume,
  onStop,
  onDelete,
  onContinueTask,
  onOpenFolder,
  pending,
}: RunDetailActionsProps) {
  const t = useTranslations("runs");
  const tk = useTranslations();
  const router = useRouter();
  const [confirm, setConfirm] = useState<"stop" | "delete" | null>(null);

  const workflow = run.kind === "workflow";
  const stop: ActionSpec = { id: "stop", onClick: () => setConfirm("stop") };
  const pause: ActionSpec = { id: "pause", onClick: onPause };
  // An agent run continues by `--resume <sessionId>` — without one there is nothing to continue.
  const canContinue = run.kind !== "agent" || Boolean(run.sessionId);

  const actions: ActionSpec[] = (() => {
    switch (mode) {
      case "running":
      case "approval":
        return workflow ? [pause, stop] : [stop];
      case "pausing":
        return [
          { id: "pausing", disabled: true, onClick: () => {} },
          // RESUME while pausing cancels the pending pause.
          { id: "resume", onClick: () => onResume() },
          stop,
        ];
      case "paused":
        return [{ id: "resume", primary: true, onClick: () => onResume() }, stop];
      case "question":
        return [stop];
      case "parked":
      case "stopped":
      case "error":
        return [
          { id: "rerunFresh", onClick: () => onResume({ mode: "fresh" }) },
          ...(canContinue
            ? [
                {
                  id: "continueSession",
                  primary: true,
                  onClick: () => onResume({ mode: "continue" }),
                } satisfies ActionSpec,
              ]
            : []),
        ];
      case "done":
        return [
          { id: "rerun", onClick: () => onResume({ mode: "fresh" }) },
          { id: "continueTask", primary: true, onClick: onContinueTask },
        ];
      default:
        return [];
    }
  })();

  const cancellable = isCancellableRun(run);
  const deletable = ["stopped", "error", "done", "waiting", "limit"].includes(mode);
  const moreItems: MenuButtonItem[] = [];
  if (run.taskId) {
    const taskId = run.taskId;
    moreItems.push({
      id: "openTask",
      label: t("detail.more.openTask"),
      onSelect: () => router.push(`/work/tasks/${taskId}`),
    });
  }
  if (agentId)
    moreItems.push({
      id: "openAgent",
      label: t("detail.more.openAgent"),
      onSelect: () => router.push(`/workforce/positions/${agentId}`),
    });
  if (workflow && onOpenFolder)
    moreItems.push({
      id: "openFolder",
      label: t("detail.more.openFolder"),
      onSelect: onOpenFolder,
    });
  moreItems.push({
    id: "copyId",
    label: t("detail.more.copyId"),
    onSelect: () => void navigator.clipboard?.writeText(run.runId),
  });
  if (deletable)
    moreItems.push({
      id: "delete",
      label: cancellable ? t("cancelTask") : t("detail.more.delete"),
      danger: true,
      disabled: pending,
      onSelect: () => setConfirm("delete"),
    });

  return (
    <Stack align="center" data-testid={RunDetailActionsTestId.Root} direction="row" gap="75">
      {actions.map((a) => (
        <Button
          data-testid={`${RunDetailActionsTestId.Action}-${a.id}`}
          disabled={a.disabled || pending}
          intent={a.primary ? "primary" : "secondary"}
          key={a.id}
          onClick={a.onClick}
        >
          {a.id === "stop" && <StatusDot size="75" tone="error" />}
          {t(`detail.action.${a.id}`)}
        </Button>
      ))}
      <Container as="span" data-testid={RunDetailActionsTestId.More}>
        <MenuButton ariaLabel={t("actionsMenuLabel")} items={moreItems} variant="bordered" />
      </Container>

      {confirm === "stop" && (
        <ConfirmDeleteDialog
          body={t("detail.confirm.stopBody", {
            stage: currentStageName ?? run.currentStage ?? "—",
          })}
          cancelLabel={tk("common.cancel")}
          confirmLabel={t("detail.action.stop")}
          icon="stop"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            onStop();
          }}
          pending={pending}
          title={t("detail.confirm.stopTitle", { id: run.runId })}
        />
      )}
      {confirm === "delete" && (
        <ConfirmDeleteDialog
          body={cancellable ? t("cancelBody") : t("detail.confirm.deleteBody")}
          cancelLabel={tk("common.cancel")}
          confirmLabel={cancellable ? t("cancelTask") : t("detail.more.delete")}
          icon="x"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            onDelete();
          }}
          pending={pending}
          title={
            cancellable ? t("cancelTitle") : t("detail.confirm.deleteTitle", { id: run.runId })
          }
        />
      )}
    </Stack>
  );
}
