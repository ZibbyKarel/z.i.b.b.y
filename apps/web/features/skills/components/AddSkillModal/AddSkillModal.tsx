"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Dialog,
  Divider,
  DropZoneField,
  Grid,
  Icon,
  type IconName,
  IconTile,
  Stack,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Typography,
} from "@zibby/design-system";
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

/** Extensions the directory tab ingests — `.md` often carries an empty MIME type,
 *  so accepted files are matched by name, never by the browser's content type. */
const MD_EXTENSIONS = /\.(md|markdown|txt)$/i;

/** A skill's content can be merged from many files; the design joins them with a
 *  horizontal rule so the boundaries survive in the editor. */
const MERGE_SEPARATOR = "\n\n---\n\n";

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

/** A file read from a dropped folder, awaiting selection before import. */
interface LoadedFile {
  /** Relative path within the dropped folder (`webkitRelativePath`-style). */
  path: string;
  name: string;
  content: string;
  size: number;
  checked: boolean;
}

/** react-dropzone tags each `File` with its in-folder path; the base `File` type doesn't. */
type FileWithPath = File & { path?: string };

export function AddSkillModal({ categories, pending, onClose, onSubmit }: AddSkillModalProps) {
  const t = useTranslations("forms.skill");
  const tk = useTranslations();
  const [glyph, setGlyph] = useState<IconName>("spark");
  const [contentTab, setContentTab] = useState("directory");
  const [files, setFiles] = useState<LoadedFile[]>([]);

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

  /** Read dropped files, keep only Markdown-ish ones, sort by path. Dropping a
   *  folder makes react-dropzone walk its subfolders, so this handles directories. */
  const handleDrop = (accepted: File[]) => {
    const mdFiles = accepted.filter((f) => MD_EXTENSIONS.test(f.name));
    if (mdFiles.length === 0) return;
    void Promise.all(
      mdFiles.map(async (f): Promise<LoadedFile> => {
        const path = (f as FileWithPath).path?.replace(/^\.?\//, "") ?? f.name;
        return { path, name: f.name, content: await f.text(), size: f.size, checked: true };
      }),
    ).then((loaded) => setFiles(loaded.sort((a, b) => a.path.localeCompare(b.path))));
  };

  const toggleFile = (path: string) =>
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, checked: !f.checked } : f)));

  const selectedCount = files.filter((f) => f.checked).length;

  /** Merge the checked files into the editor body and jump to the editor tab. */
  const importToEditor = () => {
    const merged = files
      .filter((f) => f.checked)
      .map((f) => f.content)
      .join(MERGE_SEPARATOR);
    if (!merged) return;
    form.setValue("instructions", merged, { shouldDirty: true, shouldValidate: true });
    setContentTab("editor");
  };

  const title = (
    <Stack align="center" direction="row" gap="150">
      <IconTile glyph={glyph} size="md" />
      <Container grow minW0>
        <Typography mono size="xl" type="note" weight="bold">
          {t("title")}
        </Typography>
        <Typography mono size="xs" type="note" variant="tertiary">
          {t("subtitle")}
        </Typography>
      </Container>
    </Stack>
  );

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {tk("common.cancel")}
          </Button>
          <Button disabled={!canSubmit} icon="plus" intent="run" onClick={() => void submit()}>
            {t("submitLabel")}
          </Button>
        </>
      }
      ariaLabel={t("title")}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={title}
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
                  <Stack gap="100">
                    <Stack align="center" direction="row" gap="100">
                      <Container grow minW0>
                        <Typography mono size="xs" type="note" variant="tertiary">
                          {t("content.directory.summary", {
                            total: files.length,
                            selected: selectedCount,
                          })}
                        </Typography>
                      </Container>
                      <Button
                        disabled={selectedCount === 0}
                        icon="check"
                        intent="run"
                        onClick={importToEditor}
                        size="sm"
                        type="button"
                      >
                        {t("content.directory.import")}
                      </Button>
                    </Stack>

                    <Card background="background" radius="sm">
                      <Container maxHeight="18rem" overflowY="auto">
                        <Stack>
                          {files.map((f, i) => {
                            const folder = f.path.includes("/")
                              ? f.path.split("/").slice(0, -1).join("/")
                              : "";
                            return (
                              <Container key={f.path}>
                                {i > 0 && <Divider />}
                                <Container padding={["100", "150"]}>
                                  <Stack align="center" direction="row" gap="100">
                                    <IconTile
                                      interactive
                                      aria-checked={f.checked}
                                      aria-label={f.name}
                                      as="button"
                                      filled={f.checked}
                                      glyph={f.checked ? "check" : undefined}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        toggleFile(f.path);
                                      }}
                                      role="checkbox"
                                      size="sm"
                                      tone={f.checked ? "accent" : "neutral"}
                                    />
                                    <Icon name="doc" size="sm" tone="faint" />
                                    <Container grow minW0>
                                      <Typography
                                        mono
                                        truncate
                                        size="sm"
                                        type="note"
                                        variant={f.checked ? "primary" : "tertiary"}
                                      >
                                        {f.name}
                                      </Typography>
                                      {folder && (
                                        <Typography mono truncate size="xs" type="note" variant="tertiary">
                                          {folder}
                                        </Typography>
                                      )}
                                    </Container>
                                    <Typography mono size="xs" type="note" variant="tertiary">
                                      {t("content.directory.fileSize", {
                                        kb: (f.size / 1024).toFixed(1),
                                      })}
                                    </Typography>
                                  </Stack>
                                </Container>
                              </Container>
                            );
                          })}
                        </Stack>
                      </Container>
                    </Card>
                  </Stack>
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
