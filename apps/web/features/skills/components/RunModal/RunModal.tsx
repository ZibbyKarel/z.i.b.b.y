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
import { Form, FormSegmentPicker, FormTextArea } from "@zibby/forms";
import { useTranslations } from "next-intl";
import { useState } from "react";

export interface RunModalProps {
  agent: Agent;
  file: string;
  projects: string[];
  onClose: () => void;
  onLaunch?: (req: { agent: Agent; prompt: string; project: string }) => void;
}

type RunFormValues = { prompt: string; project: string };

export function RunModal({
  agent,
  file,
  projects,
  onClose,
  onLaunch,
}: RunModalProps) {
  const t = useTranslations();
  const [launched, setLaunched] = useState(false);
  const [launchData, setLaunchData] = useState<RunFormValues | null>(null);

  const name = agent.name ?? agent.id;
  const desc = agent.description ?? "";
  const glyph = (agent.glyph as IconName | undefined) ?? "bot";

  function onFormSubmit(values: RunFormValues) {
    setLaunchData(values);
    onLaunch?.({ agent, prompt: values.prompt, project: values.project });
    setLaunched(true);
  }

  const launchedProject = launchData?.project ?? projects[0] ?? "";

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
              {t("runModal.launchedTarget", { name, project: launchedProject })}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              {t.rich("runModal.watch", {
                agents: (chunks) => (
                  <Typography as="span" size="md" tone="accent" type="note">
                    {chunks}
                  </Typography>
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
            defaultValues: { prompt: "", project: projects[0] ?? "" },
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

            {projects.length > 0 && (
              <FormSegmentPicker<RunFormValues>
                label={t("common.targetProject")}
                name="project"
                options={projects.map((p) => ({ value: p, label: p }))}
              />
            )}

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
