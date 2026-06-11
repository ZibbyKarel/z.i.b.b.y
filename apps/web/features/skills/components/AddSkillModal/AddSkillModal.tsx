"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DropZoneField,
  Grid,
  type IconName,
  IconTile,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@zibby/design-system";
import { DialogTitle } from "../../../../components/DialogTitle/DialogTitle";
import {
  FormMarkdownEditor,
  FormSelect,
  FormTextArea,
  FormTextInput,
  useFormControls,
  zodResolver,
} from "@zibby/forms";
import { z } from "zod";
import { AGENT_GLYPHS } from "../../../../state/config";
import { useSkillFileList } from "../../hooks/useSkillFileList";
import { SkillFileList } from "./SkillFileList";

const schema = z.object({
  name: z.string().min(1),
  desc: z.string(),
  category: z.string(),
  instructions: z.string(),
});

type AddSkillFormValues = z.infer<typeof schema>;

export interface AddSkillSubmit {
  name: string;
  desc: string;
  category?: string;
  glyph: IconName;
  instructions: string;
}

export interface AddSkillModalProps {
  /** Category names offered in the picker; the picker is hidden when empty. */
  categories: string[];
  pending?: boolean;
  onClose: () => void;
  onSubmit: (values: AddSkillSubmit) => void;
}

export function AddSkillModal({ categories, pending, onClose, onSubmit }: AddSkillModalProps) {
  const t = useTranslations("forms.skill");
  const tk = useTranslations();
  const [glyph, setGlyph] = useState<IconName>("spark");
  const [contentTab, setContentTab] = useState("directory");
  const { files, selectedCount, handleDrop, toggleFile, mergeSelected } = useSkillFileList();

  const { renderForm, submit, form } = useFormControls<AddSkillFormValues>({
    defaultValues: { name: "", desc: "", category: "", instructions: "" },
    resolver: zodResolver(schema),
    mode: "onChange",
    onSubmit: (values) => {
      if (pending) return;
      onSubmit({
        name: values.name.trim(),
        desc: values.desc.trim(),
        category: values.category.trim() || undefined,
        glyph,
        instructions: values.instructions.trim(),
      });
    },
  });

  const canSubmit = form.formState.isValid && !pending;

  /** Merge the checked files into the editor body and jump to the editor tab. */
  const importToEditor = () => {
    const merged = mergeSelected();
    if (!merged) return;
    form.setValue("instructions", merged, { shouldDirty: true, shouldValidate: true });
    setContentTab("editor");
  };

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} icon="plus" intent="primary" onClick={() => void submit()}>
            {t("submitLabel")}
          </Button>
        </>
      }
      ariaLabel={t("title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={<DialogTitle glyph={glyph} subtitle={t("subtitle")} title={t("title")} />}
      width="2xl"
    >
      <Grid align="start" cols={1} gap="300" md={2}>
        {/* left — meta */}
        <Stack gap="200">
          <FormTextInput<AddSkillFormValues>
            autoFocus
            label={t("nameLabel")}
            name="name"
            placeholder={t("namePlaceholder")}
          />
          <FormTextArea<AddSkillFormValues>
            hint={t("descHint")}
            label={t("descLabel")}
            name="desc"
            placeholder={t("descPlaceholder")}
          />
          {categories.length > 0 && (
            <FormSelect<string, AddSkillFormValues>
              label={tk("skills.fields.category")}
              name="category"
              options={[
                { value: "", label: t("content.noCategory") },
                ...categories.map((c) => ({ value: c, label: c })),
              ]}
            />
          )}
          <Stack gap="75">
            <Typography mono size="sm" type="note" variant="secondary">
              {t("content.glyphLabel")}
            </Typography>
            <Stack wrap direction="row" gap="75">
              {AGENT_GLYPHS.map((g) => (
                <IconTile
                  interactive
                  aria-label={g}
                  aria-pressed={glyph === g}
                  as="button"
                  glyph={g}
                  key={g}
                  onClick={(e) => {
                    e.preventDefault();
                    setGlyph(g);
                  }}
                  size="sm"
                  tone={glyph === g ? "accent" : "neutral"}
                />
              ))}
            </Stack>
          </Stack>
        </Stack>

        {/* right — content source */}
        <Stack gap="100">
          <Typography mono size="sm" type="note" variant="secondary">
            {t("content.label")}
          </Typography>
          <Tabs onValueChange={setContentTab} value={contentTab}>
            <TabList>
              <Tab value="directory">{t("content.directoryTab")}</Tab>
              <Tab value="editor">{t("content.editorTab")}</Tab>
            </TabList>

            <TabPanel value="directory">
              <Stack gap="150">
                <DropZoneField
                  multiple
                  hint={t("content.directory.hint")}
                  label={t("content.directory.label")}
                  onDrop={handleDrop}
                />

                {files.length > 0 && (
                  <SkillFileList
                    files={files}
                    onImport={importToEditor}
                    onToggle={toggleFile}
                    selectedCount={selectedCount}
                  />
                )}
              </Stack>
            </TabPanel>

            <TabPanel value="editor">
              <FormMarkdownEditor<AddSkillFormValues>
                ariaLabel={t("content.label")}
                name="instructions"
                placeholder={t("content.editor.placeholder")}
              />
            </TabPanel>
          </Tabs>
        </Stack>
      </Grid>
    </Dialog>,
  );
}
