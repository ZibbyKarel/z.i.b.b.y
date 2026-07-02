"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
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
import { FormMarkdownEditor, FormSelect, FormTextArea, FormTextInput } from "@zibby/forms";
import { AGENT_GLYPHS } from "../../../state/config";
import { useSkillFileList } from "../hooks/useSkillFileList";
import { SkillFileList } from "./AddSkillModal/SkillFileList";

/** Field names the skill form renders — both surfaces type their forms with these. */
export type SkillFormValues = {
  name: string;
  desc: string;
  category: string;
  instructions: string;
};

export interface SkillFormFieldsProps {
  /** Category names offered in the picker; the picker is hidden when empty. */
  categories: string[];
  glyph: IconName;
  onGlyphChange: (glyph: IconName) => void;
  /** Write the merged directory import into the form's `instructions` field. */
  setInstructions: (value: string) => void;
  /** Which content tab opens first — create starts at import, detail at editor. */
  initialTab?: "directory" | "editor";
}

/**
 * The skill form body (N4d) — meta on the left (name, desc, category, glyph),
 * content source on the right (directory import ⇄ Markdown editor). Shared by
 * the create-only {@link AddSkillModal} and the `/skills/:id` detail page, so
 * both surfaces stay identical. Must render inside a `useFormControls`
 * `renderForm` whose values include {@link SkillFormValues}.
 */
export function SkillFormFields({
  categories,
  glyph,
  onGlyphChange,
  setInstructions,
  initialTab = "directory",
}: SkillFormFieldsProps) {
  const t = useTranslations("forms.skill");
  const tk = useTranslations();
  const [contentTab, setContentTab] = useState<string>(initialTab);
  const { files, selectedCount, handleDrop, toggleFile, mergeSelected } = useSkillFileList();

  /** Merge the checked files into the editor body and jump to the editor tab. */
  const importToEditor = () => {
    const merged = mergeSelected();
    if (!merged) return;
    setInstructions(merged);
    setContentTab("editor");
  };

  return (
    <Grid align="start" cols={1} gap="300" md={2}>
      {/* left — meta */}
      <Stack gap="200">
        <FormTextInput<SkillFormValues>
          autoFocus
          label={t("nameLabel")}
          name="name"
          placeholder={t("namePlaceholder")}
        />
        <FormTextArea<SkillFormValues>
          hint={t("descHint")}
          label={t("descLabel")}
          name="desc"
          placeholder={t("descPlaceholder")}
        />
        {categories.length > 0 && (
          <FormSelect<string, SkillFormValues>
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
                  onGlyphChange(g);
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
            <FormMarkdownEditor<SkillFormValues>
              ariaLabel={t("content.label")}
              name="instructions"
              placeholder={t("content.editor.placeholder")}
            />
          </TabPanel>
        </Tabs>
      </Stack>
    </Grid>
  );
}
