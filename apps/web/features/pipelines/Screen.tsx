"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Container,
  Divider,
  Grid,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Pipeline } from "../../domain";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { HudPanel } from "../../components/HudPanel/HudPanel";
import { EntityFormModal } from "../../components/EntityFormModal/EntityFormModal";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { PhaseChain } from "./components/PhaseChain";
import { PipelineCard } from "./components/PipelineCard/PipelineCard";
import { PipelineRunModal } from "./components/PipelineRunModal/PipelineRunModal";
import { PROJECTS } from "../../state/config";
import { useEntityForm } from "../../state/forms";
import { useAgentsQuery } from "../agents/queries";
import { usePipelinesQuery } from "./queries";
import { useCreatePipelineMutation, useStartPipelineRunMutation } from "./mutations";

export interface ScreenProps {
  /** Pre-selected pipeline id from the [id] route segment. */
  selectedId?: string;
}

/** Slugify a free-form name into a filename-safe pipeline id. */
const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "novy";

export function Screen({ selectedId: routeId }: ScreenProps) {
  const t = useTranslations();
  const { data: pipelines = [] } = usePipelinesQuery();
  const createPipeline = useCreatePipelineMutation();
  const startRun = useStartPipelineRunMutation();
  const { data: agents = [] } = useAgentsQuery();
  const [runPipeline, setRunPipeline] = useState<Pipeline | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  const form = useEntityForm("pipeline");

  const list = pipelines;
  const selected = (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  const addModal = adding && (
    <EntityFormModal
      fields={form.fields}
      filePreview={form.filePreview}
      glyph={form.glyph}
      onClose={() => setAdding(false)}
      onSubmit={(values) => {
        const id = slug(values.name ?? "");
        const desc = values.desc?.trim() || t("defaults.pipeline");
        const budget = Number.parseInt(values.budget ?? "", 10);
        createPipeline.mutate(
          {
            body: {
              id,
              name: values.name?.trim() || id,
              desc,
              budget: Number.isFinite(budget) ? budget : 25,
              instructions: desc,
              // The minimal create form has no phase editor yet; seed a single
              // editable phase so the .pipeline.md is valid (phases min 1).
              phases: [
                {
                  id: "phase-1",
                  agent: agents[0]?.id ?? "agent",
                  consumes: "task.md",
                  produces: "output.md",
                  model: "sonnet",
                  thinking: "medium",
                },
              ],
            },
          },
          { onSuccess: () => setAdding(false) },
        );
      }}
      submitLabel={form.submitLabel}
      subtitle={form.subtitle}
      title={form.title}
    />
  );

  const toolbar = (
    <SectionToolbar
      addLabel={t("pipelines.addPipeline")}
      label={t("pipelines.sectionLabel")}
      onAdd={() => setAdding(true)}
    />
  );

  if (list.length === 0) {
    return (
      <PageContainer>
        {toolbar}
        <EmptyState
          actionLabel={t("pipelines.addPipeline")}
          description={t("pipelines.emptyDescription")}
          glyph="flow"
          hint={t("pipelines.emptyHint")}
          onAction={() => setAdding(true)}
          title={t("pipelines.emptyTitle")}
        />
        {addModal}
      </PageContainer>
    );
  }

  return (
    <Grid center align="start" gap="250" maxWidth="1400px" sidebar="left">
      <Stack gap="150">
        {toolbar}
        {list.map((p) => (
          <PipelineCard
            agents={agents}
            key={p.id}
            onSelect={(id: string) => router.push(`/pipelines/${id}`)}
            pipeline={p}
            selected={p.id === (selected?.id ?? "")}
          />
        ))}
      </Stack>

      {selected && (
        <Stack gap="250">
          <HudPanel padding="250">
            <Stack gap="200">
              <Stack wrap align="start" direction="row" gap="200" justify="between">
                <Container minW0>
                  <Stack gap="100">
                    <Typography size="3xl" type="title" weight="semibold">
                      {selected.name}
                    </Typography>
                    <Typography mono size="caption" type="note" variant="secondary">
                      {selected.desc}
                    </Typography>
                    <Stack align="center" direction="row" gap="75">
                      <Icon name="file" size="xs" tone="faint" />
                      <Typography mono size="sm" type="note" variant="tertiary">
                        {selected.file}
                      </Typography>
                    </Stack>
                  </Stack>
                </Container>
                <Stack align="center" direction="row" gap="100">
                  <Button icon="edit" intent="ghost" size="sm">{t("common.edit")}</Button>
                  <Button icon="link" intent="ghost" size="sm">{t("common.duplicate")}</Button>
                  <Button icon="play" intent="run" onClick={() => setRunPipeline(selected)}>
                    {t("pipelines.runPipeline")}
                  </Button>
                </Stack>
              </Stack>
              <Divider />
              <Stack wrap align="center" direction="row" gap="250">
                <Stack align="center" direction="row" gap="100">
                  <Icon name="dollar" size="md" tone="accent" />
                  <Container>
                    <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                      {t("pipelines.phaseCap")}
                    </Typography>
                    <Typography mono size="xl" type="note" weight="bold">
                      ${selected.budget}
                    </Typography>
                  </Container>
                </Stack>
                <Container height="32px">
                  <Divider orientation="vertical" />
                </Container>
                <Stack align="center" direction="row" gap="100">
                  <Icon name="branch" size="md" tone="dim" />
                  <Typography mono size="caption" type="note" variant="secondary">
                    {t("pipelines.branchNote")}
                  </Typography>
                </Stack>
              </Stack>
            </Stack>
          </HudPanel>

          <HudPanel padding="250" title={t("pipelines.chainTitle")}>
            <PhaseChain agents={agents} pipeline={selected} />
          </HudPanel>
        </Stack>
      )}

      {runPipeline && (
        <PipelineRunModal
          agents={agents}
          key={runPipeline.id}
          onClose={() => setRunPipeline(null)}
          onLaunch={({ project }) =>
            startRun.mutate({ params: { id: runPipeline.id }, body: { project } })
          }
          pipeline={runPipeline}
          projects={[...PROJECTS]}
        />
      )}
      {addModal}
    </Grid>
  );
}
