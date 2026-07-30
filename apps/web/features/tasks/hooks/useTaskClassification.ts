import type { TaskOutput } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { selectApiResponseBody } from "../../../state/selectApiResponseBody";
import { INITIAL_LOOP_STATE, type LoopFormState, proposedGoalToLoopState } from "../loop";
import { useClassifyTaskMutation } from "../mutations";
import { type TaskRouting, type TaskTarget, targetKey, toClientRouting } from "../task";

/** Debounce before the live classify preview fires while the operator types. */
const CLASSIFY_DEBOUNCE_MS = 350;

export interface UseTaskClassificationArgs {
  text: string;
  paths: string[];
  /** A pre-selected destination ("Run pipeline") — always present in the picker. */
  initialTarget?: TaskTarget;
  /**
   * The operator's chosen terminal sink, forwarded to the classifier because it
   * CONSTRAINS which units are eligible (a `pr` sink admits only PR-capable
   * pipelines — see `ClassifyTaskInput.output`). Without it the preview would rank a
   * roster the dispatch then refuses, so the picker would offer targets that cannot
   * run — the preview and the dispatch must never drift.
   */
  output?: TaskOutput;
}

export interface UseTaskClassification {
  /** The live classify verdict, or null while the query is too short. */
  activeRouting: TaskRouting | null;
  /** The verdict the "ZIBBY will…" preview renders (an explicit pick wins over classify). */
  previewRouting: TaskRouting | null;
  /** Every target the picker offers: the pre-selected one plus live candidates, deduped. */
  allTargets: TaskTarget[];
  chosenKey: string;
  setChosenKey: (key: string) => void;
  /** The effective single-dispatch target (an explicit pick), or null in auto mode. */
  chosenTarget: TaskTarget | null;
  /** True when the verdict is a synthesized loop (only inferred in auto mode). */
  isLoop: boolean;
  loop: LoopFormState;
  patchLoop: (patch: Partial<LoopFormState>) => void;
}

/**
 * Owns the live classification of the typed task: the debounced side-effect-free
 * classify call, the inferred single-vs-loop mode, the target picker's options and
 * the goal-form seeding. The dialog reads the derived verdict; it never drives the
 * classifier itself.
 */
export function useTaskClassification({
  text,
  paths,
  initialTarget,
  output,
}: UseTaskClassificationArgs): UseTaskClassification {
  const t = useTranslations("tasks");
  const { mutate: classify } = useClassifyTaskMutation();

  const [routing, setRouting] = useState<TaskRouting | null>(null);
  const [loop, setLoop] = useState<LoopFormState>(INITIAL_LOOP_STATE);
  const [loopEdited, setLoopEdited] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);
  /**
   * The chosen single-dispatch target, as a {@link targetKey}. "" = auto (let the
   * classifier decide). Seeded from `initialTarget` so "Run pipeline" pre-selects the
   * pipeline; the operator can switch it to another candidate or back to auto.
   */
  const [chosenKey, setChosenKey] = useState<string>(initialTarget ? targetKey(initialTarget) : "");

  // Gate the preview on a long-enough query so a stale verdict never lingers after
  // the field is cleared (no setState-in-effect needed to reset it).
  const hasQuery = text.trim().length > 2;
  const activeRouting = hasQuery ? routing : null;

  // The side-effect-free verdict (the backend never starts a run here).
  const runClassify = useCallback(() => {
    classify(
      { body: { text, paths, ...(output ? { output } : {}) } },
      { onSuccess: (res) => setRouting(toClientRouting(selectApiResponseBody(res))) },
    );
  }, [classify, text, paths, output]);

  // ── Live classify preview ───────────────────────────────────────────────
  // Runs even with a pre-selected target: it populates the alternatives the picker
  // offers (so the choice stays changeable) and resolves the typed paths.
  useEffect(() => {
    if (text.trim().length <= 2) return;
    const handle = setTimeout(runClassify, CLASSIFY_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, runClassify]);

  // Seed the Loop form from a fresh proposal during render (the React-sanctioned
  // "adjust state on prop change" pattern, guarded against re-running) — unless the
  // operator has already edited it.
  const proposedGoalKey = activeRouting?.proposedGoal
    ? JSON.stringify(activeRouting.proposedGoal)
    : null;
  if (proposedGoalKey && proposedGoalKey !== seededKey) {
    setSeededKey(proposedGoalKey);
    if (!loopEdited && activeRouting?.proposedGoal) {
      setLoop(proposedGoalToLoopState(activeRouting.proposedGoal));
    }
  }

  const patchLoop = useCallback((patch: Partial<LoopFormState>) => {
    setLoopEdited(true);
    setLoop((prev) => ({ ...prev, ...patch }));
  }, []);

  // The targets the picker offers: the pre-selected one (if any) plus the live
  // classify candidates, deduped — the seeded target is always present, so it never
  // falls out of the list when candidates change.
  const allTargets = useMemo(() => {
    const list: TaskTarget[] = [];
    const seen = new Set<string>();
    for (const target of [
      ...(initialTarget ? [initialTarget] : []),
      ...(activeRouting?.candidates ?? []),
    ]) {
      const key = targetKey(target);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(target);
      }
    }
    return list;
  }, [initialTarget, activeRouting]);

  // The effective single-dispatch target: an explicit pick, or null (auto → classify).
  const chosenTarget = chosenKey
    ? (allTargets.find((target) => targetKey(target) === chosenKey) ?? null)
    : null;
  // An explicit pick is always a one-shot dispatch — a loop is only inferred in auto mode.
  const isLoop = !chosenTarget && activeRouting?.mode === "loop";

  // The "ZIBBY will…" preview reflects the *effective* target: an explicit pick (the
  // pre-selected pipeline or a chosen candidate) shown as a one-shot dispatch; else
  // the live classify verdict as-is. So the preview and the dispatch never drift.
  const previewRouting: TaskRouting | null = chosenTarget
    ? {
        target: chosenTarget,
        confidence: 1,
        reason: t("target.chosenReason"),
        matchedTerms: [],
        candidates: activeRouting?.candidates ?? [chosenTarget],
        mode: "single",
        proposedGoal: null,
        paths: activeRouting?.paths ?? [],
        // Carries over the last classify's proposal (same posture as `paths`/
        // `candidates` above) — imprecise if the operator's pick differs from the
        // classified target, but there's no separate call scoped to an arbitrary
        // @-mention pick's own `optionalTools`.
        toolGrants: activeRouting?.toolGrants ?? [],
      }
    : activeRouting;

  return {
    activeRouting,
    previewRouting,
    allTargets,
    chosenKey,
    setChosenKey,
    chosenTarget,
    isLoop,
    loop,
    patchLoop,
  };
}
