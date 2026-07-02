"use client";

import { useTranslations } from "next-intl";
import { Grid, Stack, Typography } from "@zibby/design-system";
import {
  FormMarkdownEditor,
  FormTextArea,
  FormTextInput,
  FormToggle,
} from "@zibby/forms";

/** Field names the command form renders — both surfaces type their forms with these. */
export type CommandFormValues = {
  id: string;
  description: string;
  argumentHint: string;
  allowedTools: string;
  model: string;
  disableModelInvocation: boolean;
  enabled: boolean;
  instructions: string;
};

export interface CommandFormFieldsProps {
  /** Lock the `/<id>` — it names the backing file, so the detail page can't change it. */
  idLocked?: boolean;
}

/**
 * The command form body (N4d) — frontmatter fields on the left, the Markdown
 * `instructions` body (with `$ARGUMENTS` substitution) on the right. Shared by
 * the create-only {@link AddCommandModal} and the `/commands/:id` detail page.
 * Must render inside a `useFormControls` `renderForm` whose values include
 * {@link CommandFormValues}.
 */
export function CommandFormFields({ idLocked = false }: CommandFormFieldsProps) {
  const t = useTranslations("forms.command");

  return (
    <Grid align="start" cols={1} gap="300" md={2}>
      {/* left — frontmatter */}
      <Stack gap="200">
        <FormTextInput<CommandFormValues>
          autoFocus={!idLocked}
          disabled={idLocked}
          hint={t("idHint")}
          label={t("idLabel")}
          name="id"
          placeholder="orchestrate"
        />
        <FormTextArea<CommandFormValues>
          hint={t("descHint")}
          label={t("descLabel")}
          name="description"
          placeholder={t("descPlaceholder")}
        />
        <FormTextInput<CommandFormValues>
          hint={t("argumentHintHint")}
          label={t("argumentHintLabel")}
          name="argumentHint"
          placeholder="[issue-number] [priority]"
        />
        <FormTextInput<CommandFormValues>
          hint={t("allowedToolsHint")}
          label={t("allowedToolsLabel")}
          name="allowedTools"
          placeholder="Read, Bash, Edit"
        />
        <FormTextInput<CommandFormValues>
          hint={t("modelHint")}
          label={t("modelLabel")}
          name="model"
          placeholder="opus"
        />
        <FormToggle<CommandFormValues>
          hint={t("disableInvocationHint")}
          label={t("disableInvocationLabel")}
          name="disableModelInvocation"
        />
        <FormToggle<CommandFormValues> label={t("enabledLabel")} name="enabled" />
      </Stack>

      {/* right — instructions body */}
      <Stack gap="100">
        <Typography mono size="sm" type="note" variant="secondary">
          {t("instructionsLabel")}
        </Typography>
        <FormMarkdownEditor<CommandFormValues>
          ariaLabel={t("instructionsLabel")}
          name="instructions"
          placeholder={t("instructionsPlaceholder")}
        />
      </Stack>
    </Grid>
  );
}
