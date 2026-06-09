"use client";
import type { Agent } from "@zibby/contracts";
import type { IconName } from "@zibby/design-system";
import {
  Button,
  Card,
  Container,
  Dialog,
  Icon,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import {
  Form,
  FormFilePicker,
  FormSegmentPicker,
  FormTextArea,
  useWatch,
} from "@zibby/forms";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export interface RunModalProps {
  agent: Agent;
  file: string;
  projects: string[];
  onClose: () => void;
  onLaunch?: (req: {
    agent: Agent;
    prompt: string;
    project: string;
    files: string[];
  }) => void;
}

type RunMode = "project" | "files";
type RunFormValues = {
  prompt: string;
  mode: RunMode;
  project: string;
  files: File[];
};

/**
 * Folder-relative path of a picked file. The browser never exposes the
 * host-absolute path, so a directory pick yields `webkitRelativePath`
 * (e.g. `src/index.ts`); an individual file falls back to its bare name.
 */
const filePath = (f: File) => f.webkitRelativePath || f.name;

/**
 * Target chooser rendered inside the form so it can watch the `mode` field:
 * a Project/Files toggle (only when projects exist) followed by either the
 * project segment picker or a directory picker.
 */
function TargetFields({ projects }: { projects: string[] }) {
  const t = useTranslations();
  const mode = (useWatch({ name: "mode" }) as RunMode | undefined) ?? "project";
  const hasProjects = projects.length > 0;
  const showProject = mode === "project" && hasProjects;

  return (
    <>
      {hasProjects && (
        <FormSegmentPicker<RunFormValues>
          label={t("runModal.targetLabel")}
          name="mode"
          options={[
            { value: "project", label: t("runModal.targetProjectOption") },
            { value: "files", label: t("runModal.targetFilesOption") },
          ]}
        />
      )}

      {showProject ? (
        <FormSegmentPicker<RunFormValues>
          label={t("common.targetProject")}
          name="project"
          options={projects.map((p) => ({ value: p, label: p }))}
        />
      ) : (
        <FormFilePicker<RunFormValues>
          directory
          hint={t("runModal.filesHint")}
          label={t("runModal.filesLabel")}
          name="files"
        />
      )}
    </>
  );
}

export function RunModal({
  agent,
  file,
  projects,
  onClose,
  onLaunch,
}: RunModalProps) {
  const t = useTranslations();
  const [launched, setLaunched] = useState(false);
  const [launchedTarget, setLaunchedTarget] = useState("");

  const name = agent.name ?? agent.id;
  const desc = agent.description ?? "";
  const glyph = (agent.glyph as IconName | undefined) ?? "bot";
  const hasProjects = projects.length > 0;

  function onFormSubmit(values: RunFormValues) {
    const useFiles = values.mode === "files" || !hasProjects;
    const files = useFiles ? values.files.map(filePath) : [];
    const project = useFiles ? "" : values.project;
    setLaunchedTarget(
      useFiles ? t("runModal.filesTarget", { count: files.length }) : project,
    );
    onLaunch?.({ agent, prompt: values.prompt, project, files });
    setLaunched(true);
  }

  return (
    <Dialog
      open
      actions={
        launched ? undefined : (
          <Stack grow align="center" direction="row" justify="between">
            <Button icon="edit" intent="ghost">
              {t("runModal.editRaw")}
            </Button>
            <Button form="run-form" icon="play" intent="run" type="submit">
              {t("runModal.launch")}
            </Button>
          </Stack>
        )
      }
      ariaLabel={t("runModal.runAria", { name })}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph={glyph} size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {name}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {desc}
            </Typography>
          </Container>
        </Stack>
      }
      width="lg"
    >
      {launched ? (
        <Container padding={["200", "100"]} textAlign="center">
          <Stack align="center" gap="100">
            <IconTile
              glow
              filled={false}
              glyph="play"
              shape="circle"
              size="xl"
            />
            <Typography size="xl" type="subtitle" weight="semibold">
              {t("runModal.launchedTitle")}
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {t("runModal.launchedTarget", { name, project: launchedTarget })}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              {t.rich("runModal.watch", {
                agents: (chunks) => (
                  <Link href="/runs?filter=running">
                    <Typography as="span" size="md" tone="accent" type="note">
                      {chunks}
                    </Typography>
                  </Link>
                ),
              })}
            </Typography>
            <Button icon="pulse" intent="ghost" onClick={onClose}>
              {t("common.close")}
            </Button>
          </Stack>
        </Container>
      ) : (
        <Form<RunFormValues>
          formOptions={{
            defaultValues: {
              prompt: "",
              mode: hasProjects ? "project" : "files",
              project: projects[0] ?? "",
              files: [],
            },
          }}
          id="run-form"
          onSubmit={onFormSubmit}
        >
          <Stack gap="200">
            <FormTextArea<RunFormValues>
              autoFocus
              label={t("runModal.promptLabel")}
              name="prompt"
              placeholder={t("runModal.promptPlaceholder", { name })}
            />

            <TargetFields projects={projects} />

            <Card background="background" radius="sm">
              <Container padding={["150", "150"]}>
                <Stack align="center" direction="row" gap="100">
                  <Icon name="file" size="sm" tone="faint" />
                  <Typography
                    mono
                    size="caption"
                    type="note"
                    variant="tertiary"
                  >
                    {file}
                  </Typography>
                </Stack>
              </Container>
            </Card>
          </Stack>
        </Form>
      )}
    </Dialog>
  );
}
