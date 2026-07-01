"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { CreateChainInput } from "@zibby/contracts";
import {
  Button,
  Container,
  Dialog,
  IconTile,
  SelectField,
  Stack,
  TextAreaField,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { slug } from "../../../utils/slug";

/** Testids for the chain composer (tests select via these). */
export enum NewChainDialogTestId {
  Name = "chain-name",
  Instructions = "chain-instructions",
  AddStep = "chain-add-step",
  Submit = "chain-submit",
}

export interface NewChainDialogProps {
  /** The pipeline catalog the steps compose from: `{ id, name }` pairs. */
  pipelines: Array<{ id: string; name: string }>;
  /** Disables the submit while the create request is in flight. */
  isPending?: boolean;
  onClose: () => void;
  onCreate: (input: CreateChainInput) => void;
}

/**
 * The "New chain" dialog (create only — the grammar reserves dialogs for
 * create/confirm). The operator names the chain, writes the step-0 brief and
 * composes an ORDERED list of pipelines; step N+1 will consume step N's
 * delivered artifact at run time (N2b). The id derives from the name via the
 * shared slug util.
 */
export function NewChainDialog({
  pipelines,
  isPending = false,
  onClose,
  onCreate,
}: NewChainDialogProps) {
  const t = useTranslations("chains");
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [steps, setSteps] = useState<string[]>([pipelines[0]?.id ?? ""]);

  const options = pipelines.map((p) => ({ value: p.id, label: p.name }));
  const canSubmit =
    !isPending && name.trim().length > 0 && steps.length > 0 && steps.every(Boolean);

  const submit = () =>
    onCreate({
      id: slug(name),
      name: name.trim(),
      steps: steps.map((pipeline) => ({ pipeline })),
      ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
    });

  const header = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph="link" size="md" />
      <Typography mono size="md" tracking="wide" type="note" weight="bold">
        {t("newTitle")}
      </Typography>
    </Stack>
  );

  const actions = (
    <Stack grow align="center" direction="row" gap="100" justify="end">
      <Button icon="x" intent="ghost" onClick={onClose}>
        {t("cancel")}
      </Button>
      <Button
        data-testid={NewChainDialogTestId.Submit}
        disabled={!canSubmit}
        icon="check"
        intent="primary"
        onClick={submit}
      >
        {t("create")}
      </Button>
    </Stack>
  );

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={t("newTitle")}
      closeLabel={t("cancel")}
      onClose={onClose}
      title={header}
      width="lg"
    >
      <Stack gap="150">
        <TextInputField
          data-testid={NewChainDialogTestId.Name}
          hint={t("nameHint", { id: slug(name) || "…" })}
          label={t("nameLabel")}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          value={name}
        />
        <TextAreaField
          data-testid={NewChainDialogTestId.Instructions}
          hint={t("instructionsHint")}
          label={t("instructionsLabel")}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t("instructionsPlaceholder")}
          rows={3}
          value={instructions}
        />

        <Stack gap="100">
          <Typography mono size="sm" type="note" variant="secondary" weight="semibold">
            {t("stepsLabel")}
          </Typography>
          {steps.map((stepId, index) => (
            <Stack align="end" direction="row" gap="100" key={`step-${index}`}>
              <Container grow minW0>
                <SelectField
                  label={t("stepLabel", { n: index + 1 })}
                  onValueChange={(value) =>
                    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)))
                  }
                  options={options}
                  value={stepId}
                />
              </Container>
              <Button
                aria-label={t("removeStep", { n: index + 1 })}
                disabled={steps.length <= 1}
                icon="x"
                intent="ghost"
                onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                size="sm"
              >
                {t("remove")}
              </Button>
            </Stack>
          ))}
          <Stack direction="row">
            <Button
              data-testid={NewChainDialogTestId.AddStep}
              icon="plus"
              intent="ghost"
              onClick={() => setSteps((prev) => [...prev, pipelines[0]?.id ?? ""])}
              size="sm"
            >
              {t("addStep")}
            </Button>
          </Stack>
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {t("handoffHint")}
          </Typography>
        </Stack>
      </Stack>
    </Dialog>
  );
}
