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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentsQuery } from "../../agents/queries";
import { usePipelinesQuery } from "../../pipelines/queries";
import { classifyTask } from "../classify";
import { type TaskRouting, type TaskTarget, extractPaths } from "../task";
import { ClassifyingState } from "./ClassifyingState";
import { DispatchedState } from "./DispatchedState";
import { RoutingResult } from "./RoutingResult";
import { TaskComposer } from "./TaskComposer";

type Stage = "compose" | "classifying" | "routing" | "dispatched";

export interface NewTaskDialogProps {
  onClose: () => void;
  /**
   * How long the "classifying" step lingers before the routing verdict appears.
   * Real-feeling by default; set to 0 in tests to skip the wait.
   */
  classifyDelayMs?: number;
}

/**
 * The whole New Task flow in one modal: a four-stage machine that never runs
 * anything on its own — `compose → classifying → routing → dispatched`. The
 * routing stage is an approval gate; only the explicit `Dispatch` action in the
 * footer advances to `dispatched` and hands the task off to a run.
 */
export function NewTaskDialog({ onClose, classifyDelayMs = 1100 }: NewTaskDialogProps) {
  const t = useTranslations("tasks");
  const { data: agents = [] } = useAgentsQuery();
  const { data: pipelines = [] } = usePipelinesQuery();

  const [stage, setStage] = useState<Stage>("compose");
  const [text, setText] = useState("");
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(new Set());
  const [routing, setRouting] = useState<TaskRouting | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<TaskTarget | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const paths = useMemo(
    () => extractPaths(text).filter((p) => !removedPaths.has(p)),
    [text, removedPaths],
  );
  const canSubmit = text.trim().length > 2;

  const handleClose = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onClose();
  }, [onClose]);

  const handleClassify = useCallback(() => {
    if (!canSubmit) return;
    setStage("classifying");
    const run = () => {
      const result = classifyTask(text, paths, agents, pipelines);
      setRouting(result);
      setSelectedTarget(result.target);
      setOverrideOpen(false);
      setStage("routing");
    };
    if (classifyDelayMs <= 0) run();
    else timerRef.current = setTimeout(run, classifyDelayMs);
  }, [canSubmit, text, paths, agents, pipelines, classifyDelayMs]);

  const handleRemovePath = useCallback((path: string) => {
    setRemovedPaths((prev) => new Set(prev).add(path));
  }, []);

  const handlePick = useCallback((target: TaskTarget) => {
    setSelectedTarget(target);
    setOverrideOpen(false);
  }, []);

  const handleDispatch = useCallback(() => {
    if (!selectedTarget) return;
    setStage("dispatched");
  }, [selectedTarget]);

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
          <Button icon="x" intent="ghost" onClick={handleClose}>
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
            <Button icon="bolt" intent="solid" onClick={handleDispatch}>
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
      onClose={handleClose}
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
        <DispatchedState onClose={handleClose} target={selectedTarget} />
      )}
    </Dialog>
  );
}
