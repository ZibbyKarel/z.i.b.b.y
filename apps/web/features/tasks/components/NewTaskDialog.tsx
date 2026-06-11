"use client";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useStartAgentRunMutation } from "../../agents/mutations";
import { useStartPipelineRunMutation } from "../../pipelines/mutations";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useClassifyTaskMutation } from "../mutations";
import { type TaskTarget, extractPaths, toClientRouting } from "../task";
import { TaskComposer } from "./TaskComposer";

export interface NewTaskDialogProps {
  onClose: () => void;
}

/**
 * The whole New Task flow in one modal — describe → Spustit → the runs page.
 * One click classifies the task in the background, hands it straight to the
 * routed agent or pipeline, and redirects to the new run's detail; there is no
 * intermediate "classifying" screen and nothing else to confirm here. Risky
 * actions are still caught later by the approval gate (the rules engine), which
 * is the real guardrail — not this dialog.
 */
export function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const classify = useClassifyTaskMutation();
  const startAgentRun = useStartAgentRunMutation();
  const startPipelineRun = useStartPipelineRunMutation();

  const [text, setText] = useState("");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());

  const paths = useMemo(
    () => extractPaths(text).filter((p) => !removedPaths.has(p)),
    [text, removedPaths],
  );
  const busy =
    classify.isPending || startAgentRun.isPending || startPipelineRun.isPending;
  const canSubmit = text.trim().length > 2;

  const handover = useCallback(
    (runId: string) => {
      router.push(`/runs?run=${encodeURIComponent(runId)}`);
      onClose();
    },
    [router, onClose],
  );

  const dispatch = useCallback(
    (target: TaskTarget) => {
      // A transport failure leaves the dialog open so the user can retry.
      if (target.kind === "agent") {
        startAgentRun.mutate(
          { params: { id: target.id }, body: { prompt: text, project: "", files: paths } },
          { onSuccess: (res) => handover(selectApiResponseBody(res).runId) },
        );
      } else {
        startPipelineRun.mutate(
          { params: { id: target.id }, body: {} },
          { onSuccess: (res) => handover(selectApiResponseBody(res).pipelineRunId) },
        );
      }
    },
    [text, paths, startAgentRun, startPipelineRun, handover],
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmit || busy) return;
    classify.mutate(
      { body: { text, paths } },
      {
        // Auto-run: hand the task straight to the routed target. The endpoint
        // rarely errors (it has a server-side fallback); on a transport failure
        // the dialog simply stays open for a retry.
        onSuccess: (res) =>
          dispatch(toClientRouting(selectApiResponseBody(res)).target),
      },
    );
  }, [canSubmit, busy, text, paths, classify, dispatch]);

  const handleRemovePath = useCallback((path: string) => {
    setRemovedPaths((prev) => new Set(prev).add(path));
  }, []);

  const header = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph="plus" size="md" />
      <Container grow minW0>
        <Typography mono size="md" tracking="wide" type="note" weight="bold">
          {t("dialogTitle")}
        </Typography>
        <Typography size="sm" type="note" variant="secondary">
          {t("dialogSubtitle")}
        </Typography>
      </Container>
    </Stack>
  );

  const actions = (
    <Stack grow align="center" direction="row" gap="100" justify="end">
      <Button icon="x" intent="ghost" onClick={onClose}>
        {t("cancel")}
      </Button>
      <Button
        disabled={!canSubmit}
        icon="play"
        intent="primary"
        loading={busy}
        onClick={handleSubmit}
      >
        {t("classifyRun")}
      </Button>
    </Stack>
  );

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={t("dialogTitle")}
      closeLabel={t("cancel")}
      onClose={onClose}
      title={header}
      width="lg"
    >
      <TaskComposer
        onChange={setText}
        onRemovePath={handleRemovePath}
        onSubmit={handleSubmit}
        paths={paths}
        value={text}
      />
    </Dialog>
  );
}
