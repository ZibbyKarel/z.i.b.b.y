"use client";
import { SelectField, Stack, TextAreaField, TextInputField } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useAgentsQuery } from "../../agents";
import { useWorkflowsQuery } from "../../workflows";
import { type LoopFormState, encodeMaker } from "../loop";

export interface LoopComposerProps {
  state: LoopFormState;
  onChange: (patch: Partial<LoopFormState>) => void;
}

/**
 * The Loop tab body: capture a goal (objective), pick the maker that does the work,
 * pick the reviewer agent that judges each iteration, and cap the iterations. Submitting creates a
 * goal definition and starts its run — the maker ⇄ verifier loop in the goals engine.
 */
export function LoopComposer({ state, onChange }: LoopComposerProps) {
  const t = useTranslations("tasks");
  const { data: agents } = useAgentsQuery();
  const { data: workflows } = useWorkflowsQuery();

  const makerOptions = useMemo(() => {
    const agentOpts = (agents ?? []).map((a) => ({
      value: encodeMaker("agent", a.id),
      label: a.name ?? a.id,
      code: t("loop.makerKind.agent"),
    }));
    const workflowOpts = (workflows ?? []).map((p) => ({
      value: encodeMaker("workflow", p.id),
      label: p.name,
      code: t("loop.makerKind.workflow"),
    }));
    return [{ value: "", label: t("loop.maker.placeholder") }, ...agentOpts, ...workflowOpts];
  }, [agents, workflows, t]);

  const reviewerOptions = useMemo(
    () => [
      { value: "", label: t("loop.reviewer.placeholder") },
      ...(agents ?? []).map((a) => ({ value: a.id, label: a.name ?? a.id })),
    ],
    [agents, t],
  );

  return (
    <Stack gap="150">
      <TextAreaField
        hint={t("loop.objective.hint")}
        label={t("loop.objective.label")}
        onChange={(e) => onChange({ objective: e.target.value })}
        placeholder={t("loop.objective.placeholder")}
        rows={3}
        value={state.objective}
      />

      <SelectField
        hint={t("loop.maker.hint")}
        label={t("loop.maker.label")}
        onValueChange={(maker) => onChange({ maker })}
        options={makerOptions}
        value={state.maker}
      />

      <SelectField
        hint={t("loop.reviewer.hint")}
        label={t("loop.reviewer.label")}
        onValueChange={(reviewer) => onChange({ reviewer })}
        options={reviewerOptions}
        value={state.reviewer}
      />

      <TextInputField
        inputMode="numeric"
        label={t("loop.maxIterations.label")}
        min={1}
        onChange={(e) => onChange({ maxIterations: e.target.value })}
        type="number"
        value={state.maxIterations}
      />

      <TextAreaField
        hint={t("loop.instructions.hint")}
        label={t("loop.instructions.label")}
        onChange={(e) => onChange({ instructions: e.target.value })}
        placeholder={t("loop.instructions.placeholder")}
        rows={2}
        value={state.instructions}
      />
    </Stack>
  );
}
