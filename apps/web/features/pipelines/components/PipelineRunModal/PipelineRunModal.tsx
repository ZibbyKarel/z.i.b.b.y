"use client";
import type { Agent } from "@zibby/contracts";
import {
  Button,
  Card,
  Container,
  Dialog,
  Divider,
  Grid,
  Icon,
  IconTile,
  Pressable,
  Stack,
  Typography,
} from "@zibby/design-system";
import { Form, FormSegmentPicker, FormTextArea } from "@zibby/forms";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { type Pipeline, glyphForPhase } from "../../../../domain";
import { type PhaseOverride, usePhaseOverrides } from "../../hooks/usePhaseOverrides";
import { ModelBadge, ThinkBadge } from "../PhaseChain";

export interface PipelineRunModalProps {
  pipeline: Pipeline;
  agents: Agent[];
  projects: string[];
  onClose: () => void;
  onLaunch?: (req: {
    pipeline: Pipeline;
    prompt: string;
    project: string;
    overrides: PhaseOverride[];
  }) => void;
}

type PipelineRunFormValues = {
  prompt: string;
  project: string;
};

export function PipelineRunModal({
  pipeline,
  agents,
  projects,
  onClose,
  onLaunch,
}: PipelineRunModalProps) {
  const t = useTranslations();
  const { overrides, cycleModel, cycleThink } = usePhaseOverrides(pipeline);
  const [launched, setLaunched] = useState(false);
  const [launchData, setLaunchData] = useState<PipelineRunFormValues | null>(
    null,
  );

  function onFormSubmit(values: PipelineRunFormValues) {
    setLaunchData(values);
    onLaunch?.({
      pipeline,
      prompt: values.prompt,
      project: values.project,
      overrides,
    });
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
              {t("pipelineRun.editRaw")}
            </Button>
            <Button
              form="pipeline-run-form"
              icon="play"
              intent="primary"
              type="submit"
            >
              {t("pipelineRun.launch")}
            </Button>
          </Stack>
        )
      }
      ariaLabel={t("pipelineRun.runAria", { name: pipeline.name })}
      closeLabel={t("common.close")}
      onClose={onClose}
      title={
        <Stack align="center" direction="row" gap="150">
          <IconTile glyph="flow" size="md" />
          <Container grow minW0>
            <Typography mono size="xl" type="note" weight="bold">
              {t("pipelineRun.title", { name: pipeline.name })}
            </Typography>
            <Typography size="base" type="note" variant="secondary">
              {t("pipelineRun.subtitle", { count: pipeline.phases.length })}
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
              glyph="flow"
              shape="circle"
              size="xl"
            />
            <Typography size="xl" type="subtitle" weight="semibold">
              {t("pipelineRun.launchedTitle")}
            </Typography>
            <Typography mono size="base" type="note" variant="secondary">
              {t("pipelineRun.launchedTarget", {
                name: pipeline.name,
                project: launchedProject,
              })}
            </Typography>
            <Typography size="md" type="note" variant="secondary">
              {t.rich("pipelineRun.watch", {
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
        <Form<PipelineRunFormValues>
          formOptions={{
            defaultValues: {
              prompt: "",
              project: projects[0] ?? "",
            },
          }}
          id="pipeline-run-form"
          onSubmit={onFormSubmit}
        >
          <Stack gap="200">
            <FormTextArea<PipelineRunFormValues>
              autoFocus
              label={t("pipelineRun.promptLabel")}
              name="prompt"
              placeholder={t("pipelineRun.promptPlaceholder", {
                name: pipeline.name,
              })}
            />

            <Grid cols={2} gap="250">
              {projects.length > 0 && (
                <FormSegmentPicker<PipelineRunFormValues>
                  label={t("common.targetProject")}
                  name="project"
                  options={projects
                    .slice(0, 4)
                    .map((p) => ({ value: p, label: p }))}
                />
              )}

            </Grid>

            <Stack gap="75">
              <Typography
                mono
                uppercase
                size="sm"
                tracking="wider"
                type="note"
                variant="tertiary"
              >
                {t("pipelineRun.overrideTitle")}
              </Typography>
              <Card radius="sm">
                {pipeline.phases.map((ph, i) => (
                  <Fragment key={`${ph.agent ?? ph.type}-${i}`}>
                    {i > 0 && <Divider />}
                    <Container padding={["100", "150"]}>
                      <Stack align="center" direction="row" gap="100">
                        <Icon
                          name={glyphForPhase(ph, agents)}
                          size="sm"
                          tone="accent"
                        />
                        <Container grow minW0>
                          <Typography mono size="caption" type="note">
                            {ph.type === "verify"
                              ? t("phase.verifyLabel")
                              : ph.agent}
                          </Typography>
                        </Container>
                        {ph.type === "verify" ? (
                          <Typography mono size="2xs" type="note" variant="tertiary">
                            {t("phase.checksLabel")}
                          </Typography>
                        ) : (
                          <>
                            <Pressable
                              aria-label={t("pipelineRun.changeModelAria", {
                                agent: ph.agent ?? ph.type,
                              })}
                              onClick={() => cycleModel(i)}
                            >
                              <ModelBadge model={overrides[i]!.model} />
                            </Pressable>
                            <Pressable
                              aria-label={t("pipelineRun.changeThinkAria", {
                                agent: ph.agent ?? ph.type,
                              })}
                              onClick={() => cycleThink(i)}
                            >
                              <ThinkBadge level={overrides[i]!.thinking} />
                            </Pressable>
                          </>
                        )}
                      </Stack>
                    </Container>
                  </Fragment>
                ))}
              </Card>
              <Typography mono size="xs" type="note" variant="tertiary">
                {t("pipelineRun.overrideHint")}
              </Typography>
            </Stack>
          </Stack>
        </Form>
      )}
    </Dialog>
  );
}
