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
import { useCallback, useMemo, useState } from "react";
import { useStartAgentRunMutation } from "../../agents/mutations";
import { useStartPipelineRunMutation } from "../../pipelines/mutations";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { useClassifyTaskMutation } from "../mutations";
import { type TaskRouting, type TaskTarget, extractPaths, toClientRouting } from "../task";
import { ClassifyingState } from "./ClassifyingState";
import { DispatchedState } from "./DispatchedState";
import { TaskComposer } from "./TaskComposer";

type Stage = "compose" | "classifying" | "dispatched";

export interface NewTaskDialogProps {
  onClose: () => void;
}

/**
 * The whole New Task flow in one modal — describe → Spustit → done. The task
 * is classified in the background and handed straight to the routed agent or
 * pipeline; the user watches the "classifying" state and never confirms
 * anything here. Risky actions are still caught later by the approval gate
 * (the rules engine), which is the real guardrail — not this dialog.
 */
export function NewTaskDialog({ onClose }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const classify = useClassifyTaskMutation();
  const startAgentRun = useStartAgentRunMutation();
  const startPipelineRun = useStartPipelineRunMutation();

  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState("");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [routing, setRouting] = useState<TaskRouting | null>(null);

  const paths = useMemo(
    () => extractPaths(text).filter((p) => !removedPaths.has(p)),
    [text, removedPaths],
  );
  const canSubmit = text.trim().length > 2;

  const dispatch = useCallback(
    (target: TaskTarget) => {
      const onSuccess = () => setStage("dispatched");
      // A transport failure returns to compose so the user can retry.
      const onError = () => setStage("compose");
      if (target.kind === "agent") {
        startAgentRun.mutate(
          { params: { id: target.id }, body: { prompt: text, project: "", files: paths } },
          { onSuccess, onError },
        );
      } else {
        startPipelineRun.mutate({ params: { id: target.id }, body: {} }, { onSuccess, onError });
      }
    },
    [text, paths, startAgentRun, startPipelineRun],
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmit || stage !== "compose") return;
    setStage("classifying");
    classify.mutate(
      { body: { text, paths } },
      {
        onSuccess: (res) => {
          const result = toClientRouting(selectApiResponseBody(res));
          setRouting(result);
          // Auto-run: hand the task straight to the routed target.
          dispatch(result.target);
        },
        // The endpoint rarely errors (it has a server-side fallback); on a transport
        // failure, return to compose so the user can retry.
        onError: () => setStage("compose"),
      },
    );
  }, [canSubmit, stage, text, paths, classify, dispatch]);

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

  const actions =
    stage === "compose" ? (
      <Stack grow align="center" direction="row" gap="100" justify="end">
        <Button icon="x" intent="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button disabled={!canSubmit} icon="play" intent="primary" onClick={handleSubmit}>
          {t("classifyRun")}
        </Button>
      </Stack>
    ) : undefined;

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={t("dialogTitle")}
      closeLabel={t("dispatched.close")}
      onClose={onClose}
      title={header}
      width="lg"
    >
      {stage === "compose" && (
        <TaskComposer
          onChange={setText}
          onRemovePath={handleRemovePath}
          onSubmit={handleSubmit}
          paths={paths}
          value={text}
        />
      )}
      {stage === "classifying" && <ClassifyingState />}
      {stage === "dispatched" && routing && (
        <DispatchedState onClose={onClose} target={routing.target} />
      )}
    </Dialog>
  );
}
