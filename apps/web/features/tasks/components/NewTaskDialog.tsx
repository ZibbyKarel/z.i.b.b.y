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
import { RoutingResult } from "./RoutingResult";
import { TaskComposer } from "./TaskComposer";

type Stage = "compose" | "classifying" | "routing" | "dispatched";

export interface NewTaskDialogProps {
  onClose: () => void;
}

/**
 * The whole New Task flow in one modal: a four-stage machine that never runs
 * anything on its own — `compose → classifying → routing → dispatched`. The
 * backend classifies the task (the classifying stage is the mutation's pending
 * state); the routing stage is an approval gate; only the explicit `Dispatch`
 * action starts a run (`POST /api/agents/:id/run` or `/pipelines/:id/run`).
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
  const [selectedTarget, setSelectedTarget] = useState<TaskTarget | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const paths = useMemo(
    () => extractPaths(text).filter((p) => !removedPaths.has(p)),
    [text, removedPaths],
  );
  const canSubmit = text.trim().length > 2;
  const dispatching = startAgentRun.isPending || startPipelineRun.isPending;

  const handleClassify = useCallback(() => {
    if (!canSubmit) return;
    setStage("classifying");
    classify.mutate(
      { body: { text, paths } },
      {
        onSuccess: (res) => {
          const result = toClientRouting(selectApiResponseBody(res));
          setRouting(result);
          setSelectedTarget(result.target);
          setOverrideOpen(false);
          setStage("routing");
        },
        // The endpoint rarely errors (it has a server-side fallback); on a transport
        // failure, return to compose so the user can retry.
        onError: () => setStage("compose"),
      },
    );
  }, [canSubmit, text, paths, classify]);

  const handleRemovePath = useCallback((path: string) => {
    setRemovedPaths((prev) => new Set(prev).add(path));
  }, []);

  const handlePick = useCallback((target: TaskTarget) => {
    setSelectedTarget(target);
    setOverrideOpen(false);
  }, []);

  const handleDispatch = useCallback(() => {
    if (!selectedTarget || dispatching) return;
    const onSuccess = () => setStage("dispatched");
    if (selectedTarget.kind === "agent") {
      startAgentRun.mutate(
        { params: { id: selectedTarget.id }, body: { prompt: text, project: "", files: paths } },
        { onSuccess },
      );
    } else {
      startPipelineRun.mutate({ params: { id: selectedTarget.id }, body: {} }, { onSuccess });
    }
  }, [selectedTarget, dispatching, text, paths, startAgentRun, startPipelineRun]);

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

  const actions = (() => {
    if (stage === "compose") {
      return (
        <Stack grow align="center" direction="row" gap="100" justify="end">
          <Button icon="x" intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!canSubmit} icon="bolt" intent="run" onClick={handleClassify}>
            {t("classifyRun")}
          </Button>
        </Stack>
      );
    }
    if (stage === "routing") {
      return (
        <Stack grow align="center" direction="row" gap="100" justify="between">
          <Typography mono size="2xs" type="note" variant="tertiary">
            {t("routing.dispatchHint")}
          </Typography>
          <Stack align="center" direction="row" gap="100">
            <Button icon="chevron" intent="ghost" onClick={() => setStage("compose")}>
              {t("routing.back")}
            </Button>
            <Button disabled={dispatching} icon="bolt" intent="solid" onClick={handleDispatch}>
              {t("routing.dispatch")}
            </Button>
          </Stack>
        </Stack>
      );
    }
    return undefined;
  })();

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
          onSubmit={handleClassify}
          paths={paths}
          value={text}
        />
      )}
      {stage === "classifying" && <ClassifyingState />}
      {stage === "routing" && routing && selectedTarget && (
        <RoutingResult
          onPick={handlePick}
          onToggleOverride={() => setOverrideOpen((v) => !v)}
          overrideOpen={overrideOpen}
          paths={paths}
          routing={routing}
          selectedTarget={selectedTarget}
        />
      )}
      {stage === "dispatched" && selectedTarget && (
        <DispatchedState onClose={onClose} target={selectedTarget} />
      )}
    </Dialog>
  );
}
