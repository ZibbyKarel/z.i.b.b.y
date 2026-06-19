"use client";

import { useTranslations } from "next-intl";
import { Button, Dialog, Grid, Stack, Typography } from "@zibby/design-system";
import { DialogTitle } from "../../../../components/DialogTitle/DialogTitle";
import {
  FormMarkdownEditor,
  FormTextArea,
  FormTextInput,
  FormToggle,
  useFormControls,
  zodResolver,
} from "@zibby/forms";
import { z } from "zod";

const schema = z.object({
  id: z.string(),
  description: z.string(),
  argumentHint: z.string(),
  allowedTools: z.string(),
  model: z.string(),
  disableModelInvocation: z.boolean(),
  enabled: z.boolean(),
  instructions: z.string().min(1),
});

type AddCommandFormValues = z.infer<typeof schema>;

/** What the modal emits on save — the contract frontmatter fields + the body. */
export interface AddCommandSubmit {
  id: string;
  description?: string;
  argumentHint?: string;
  /** Parsed from a comma-separated input into a tool-name list. */
  allowedTools?: string[];
  model?: string;
  disableModelInvocation: boolean;
  enabled: boolean;
  instructions: string;
}

/** Pre-fill for edit mode — the full command (incl. its `instructions` body). */
export interface AddCommandInitial {
  id: string;
  description?: string;
  argumentHint?: string;
  allowedTools?: string[];
  model?: string;
  disableModelInvocation?: boolean;
  enabled: boolean;
  instructions: string;
}

export interface AddCommandModalProps {
  pending?: boolean;
  /** When set the modal is in **edit** mode: pre-filled, "Save" + "Delete" (id locked). */
  initial?: AddCommandInitial;
  onClose: () => void;
  onSubmit: (values: AddCommandSubmit) => void;
  /** Edit mode only: delete this command (its id is owned by the caller). */
  onDelete?: () => void;
}

/** Split a comma-separated tools input into a trimmed list (or undefined). */
function parseTools(raw: string): string[] | undefined {
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * Create/edit dialog for a custom slash command — the AddSkillModal pattern: a
 * Markdown body (`instructions`, with `$ARGUMENTS` substitution) on the right, the
 * frontmatter fields on the left. The kebab-case contract keys are mapped to
 * camelCase form fields and back on submit. `id` is the `/<name>` and is locked in
 * edit mode.
 */
export function AddCommandModal({
  pending,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: AddCommandModalProps) {
  const t = useTranslations("forms.command");
  const tk = useTranslations();
  const isEdit = initial !== undefined;

  const { renderForm, submit, form } = useFormControls<AddCommandFormValues>({
    defaultValues: {
      id: initial?.id ?? "",
      description: initial?.description ?? "",
      argumentHint: initial?.argumentHint ?? "",
      allowedTools: (initial?.allowedTools ?? []).join(", "),
      model: initial?.model ?? "",
      disableModelInvocation: initial?.disableModelInvocation ?? false,
      enabled: initial?.enabled ?? true,
      instructions: initial?.instructions ?? "",
    },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      if (pending) return;
      onSubmit({
        id: values.id.trim(),
        description: values.description.trim() || undefined,
        argumentHint: values.argumentHint.trim() || undefined,
        allowedTools: parseTools(values.allowedTools),
        model: values.model.trim() || undefined,
        disableModelInvocation: values.disableModelInvocation,
        enabled: values.enabled,
        instructions: values.instructions.trim(),
      });
    },
  });

  const idValue = form.watch("id");
  const canSubmit = form.formState.isValid && idValue.trim().length > 0 && !pending;

  return renderForm(
    <Dialog
      open
      actions={
        <>
          {isEdit && onDelete && (
            <Button icon="trash" intent="danger" onClick={onDelete}>
              {tk("common.delete")}
            </Button>
          )}
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button
            disabled={!canSubmit}
            icon={isEdit ? "check" : "plus"}
            intent="primary"
            onClick={() => void submit()}
          >
            {isEdit ? tk("common.save") : t("submitLabel")}
          </Button>
        </>
      }
      ariaLabel={isEdit ? t("editTitle") : t("title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={
        <DialogTitle
          glyph="bolt"
          subtitle={isEdit ? t("editSubtitle") : t("subtitle")}
          title={isEdit ? t("editTitle") : t("title")}
        />
      }
      width="2xl"
    >
      <Grid align="start" cols={1} gap="300" md={2}>
        {/* left — frontmatter */}
        <Stack gap="200">
          <FormTextInput<AddCommandFormValues>
            autoFocus={!isEdit}
            disabled={isEdit}
            hint={t("idHint")}
            label={t("idLabel")}
            name="id"
            placeholder="orchestrate"
          />
          <FormTextArea<AddCommandFormValues>
            hint={t("descHint")}
            label={t("descLabel")}
            name="description"
            placeholder={t("descPlaceholder")}
          />
          <FormTextInput<AddCommandFormValues>
            hint={t("argumentHintHint")}
            label={t("argumentHintLabel")}
            name="argumentHint"
            placeholder="[issue-number] [priority]"
          />
          <FormTextInput<AddCommandFormValues>
            hint={t("allowedToolsHint")}
            label={t("allowedToolsLabel")}
            name="allowedTools"
            placeholder="Read, Bash, Edit"
          />
          <FormTextInput<AddCommandFormValues>
            hint={t("modelHint")}
            label={t("modelLabel")}
            name="model"
            placeholder="opus"
          />
          <FormToggle<AddCommandFormValues>
            hint={t("disableInvocationHint")}
            label={t("disableInvocationLabel")}
            name="disableModelInvocation"
          />
          <FormToggle<AddCommandFormValues> label={t("enabledLabel")} name="enabled" />
        </Stack>

        {/* right — instructions body */}
        <Stack gap="100">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("instructionsLabel")}
          </Typography>
          <FormMarkdownEditor<AddCommandFormValues>
            ariaLabel={t("instructionsLabel")}
            name="instructions"
            placeholder={t("instructionsPlaceholder")}
          />
        </Stack>
      </Grid>
    </Dialog>,
  );
}
