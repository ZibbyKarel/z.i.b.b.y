"use client";

import type { HandoverTaskRunInput } from "@zibby/contracts";
import {
  Button,
  Dialog,
  SelectField,
  Stack,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { apiErrorMessage } from "../../../state/apiErrorMessage";
import { useAgentsQuery } from "../../agents";
import { useDepartmentLookup } from "../../departments/useDepartmentLookup";
import { useWorkflowsQuery } from "../../workflows";
import { useHandoverTaskRunMutation } from "../mutations";
import type { RunView } from "../run";

export enum HandoverRunDialogTestId {
  Note = "handover-run-note",
  Submit = "handover-run-submit",
  Error = "handover-run-error",
}

export interface HandoverRunDialogProps {
  run: RunView;
  open: boolean;
  onClose: () => void;
  /** Fires with the NEW task's run id once the handover is accepted. */
  onHandedOver: (runId: string) => void;
}

type HandoverTarget = HandoverTaskRunInput["target"];

/**
 * "Hand over task": pick the unit that takes the run's task over (an explicit target —
 * the classifier is skipped) plus an optional note. The API builds the new task from
 * the original goal, this run's folder and its artifacts.
 */
export function HandoverRunDialog({ run, open, onClose, onHandedOver }: HandoverRunDialogProps) {
  const t = useTranslations("runs.detail.handover");
  const tk = useTranslations();
  const { data: workflows = [] } = useWorkflowsQuery();
  const { data: agents = [] } = useAgentsQuery();
  const departments = useDepartmentLookup();
  const handover = useHandoverTaskRunMutation();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const targets: HandoverTarget[] = [
    ...workflows.map((w) => ({ kind: "workflow" as const, id: w.id, name: w.name })),
    ...agents.map((a) => ({ kind: "agent" as const, id: a.id, name: a.name || a.id })),
    ...departments.list.map((d) => ({ kind: "department" as const, id: d.id, name: d.name })),
  ];
  const key = (x: HandoverTarget) => `${x.kind}:${x.id}`;
  const target = targets.find((x) => key(x) === value);

  const submit = () => {
    if (!target) return;
    const trimmed = note.trim();
    setError(null);
    handover.mutate(
      { params: { runId: run.runId }, body: { target, ...(trimmed && { note: trimmed }) } },
      {
        onSuccess: (res) => onHandedOver(res.body.runId),
        onError: (err) => setError(apiErrorMessage(err) ?? t("failed")),
      },
    );
  };

  return (
    <Dialog
      actions={
        <>
          <Button intent="secondary" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button
            data-testid={HandoverRunDialogTestId.Submit}
            disabled={!target || handover.isPending}
            intent="primary"
            onClick={submit}
          >
            {t("submit")}
          </Button>
        </>
      }
      description={t("description")}
      onClose={onClose}
      open={open}
      title={t("title")}
      width="lg"
    >
      <Stack gap="150">
        <SelectField
          label={t("target")}
          onValueChange={setValue}
          options={targets.map((x) => ({
            value: key(x),
            label: x.name,
            description: t(`kind.${x.kind}`),
          }))}
          placeholder={t("targetPlaceholder")}
          value={value}
        />
        <TextAreaField
          data-testid={HandoverRunDialogTestId.Note}
          hint={t("noteHint")}
          label={t("note")}
          maxLength={4000}
          onChange={(e) => setNote(e.target.value)}
          value={note}
        />
        {error && (
          <Typography data-testid={HandoverRunDialogTestId.Error} type="label" variant="secondary">
            {error}
          </Typography>
        )}
      </Stack>
    </Dialog>
  );
}
