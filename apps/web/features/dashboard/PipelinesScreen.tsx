"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Chip,
  Container,
  Divider,
  Grid,
  Icon,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { Pipeline } from "../../domain";
import { SectionLabel } from "./components/SectionLabel";
import { HudPanel } from "./components/HudPanel";
import { EntityFormModal } from "./components/EntityFormModal";
import { EmptyState } from "./components/EmptyState";
import { PhaseChain } from "../pipelines/components/PhaseChain";
import { PipelineCard } from "../pipelines/components/PipelineCard";
import { PipelineRunModal } from "../pipelines/components/PipelineRunModal";
import { PROJECTS } from "./config";
import { PIPELINE_FORM } from "./forms";
import { useDashboardStore } from "./store";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";
import { hrefWithCtx } from "./DashboardChrome";

export interface PipelinesScreenProps {
  /** Pre-selected pipeline id from the [id] route segment. */
  selectedId?: string;
}

export function PipelinesScreen({ selectedId: routeId }: PipelinesScreenProps) {
  const { context } = useGlobalStateContext();
  const { pipelines, agents, addPipeline } = useDashboardStore();
  const [runPipeline, setRunPipeline] = useState<Pipeline | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const list = pipelines.filter((p) => p.ctx === context);
  const selected = (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  const addModal = adding && (
    <EntityFormModal
      fields={PIPELINE_FORM.fields}
      filePreview={PIPELINE_FORM.filePreview}
      glyph={PIPELINE_FORM.glyph}
      onClose={() => setAdding(false)}
      onSubmit={(values) => { addPipeline(values); setAdding(false); }}
      submitLabel={PIPELINE_FORM.submitLabel}
      subtitle={PIPELINE_FORM.subtitle}
      title={PIPELINE_FORM.title}
    />
  );

  const addAction = (
    <Button icon="plus" intent="run" onClick={() => setAdding(true)} size="sm">
      Přidat pipeline
    </Button>
  );

  if (list.length === 0) {
    return (
      <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
        <SectionLabel action={addAction}>Pipeline · {context}</SectionLabel>
        <EmptyState
          actionLabel="Přidat pipeline"
          description="Pipeline řetězí agenty přes soubory. Přidej první a fáze pak poskládáš v editoru."
          glyph="flow"
          hint="// vytvoří ~/zibby/pipelines/<název>.pipeline.md"
          onAction={() => setAdding(true)}
          title="Zatím žádné pipeline"
        />
        {addModal}
      </Container>
    );
  }

  const rawCtx = context;

  return (
    <Grid center align="start" gap="250" maxWidth="1400px" sidebar="left">
      <Stack gap="150">
        <SectionLabel action={addAction}>Pipeline · {context}</SectionLabel>
        {list.map((p) => (
          <PipelineCard
            agents={agents}
            key={p.id}
            onSelect={(id: string) => router.push(hrefWithCtx(`/pipelines/${id}`, rawCtx))}
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
                    <Stack align="center" direction="row" gap="100">
                      <Typography size="3xl" type="title" weight="semibold">
                        {selected.name}
                      </Typography>
                      <Chip tone="accent">{context}</Chip>
                    </Stack>
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
                  <Button icon="edit" intent="ghost" size="sm">Editovat</Button>
                  <Button icon="link" intent="ghost" size="sm">Duplikovat</Button>
                  <Button icon="play" intent="run" onClick={() => setRunPipeline(selected)}>
                    Spustit pipeline
                  </Button>
                </Stack>
              </Stack>
              <Divider />
              <Stack wrap align="center" direction="row" gap="250">
                <Stack align="center" direction="row" gap="100">
                  <Icon name="dollar" size="md" tone="accent" />
                  <Container>
                    <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
                      STROP PIPELINE
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
                    výstup → izolovaná branch · PR k ranní review
                  </Typography>
                </Stack>
              </Stack>
            </Stack>
          </HudPanel>

          <HudPanel padding="250" title="zřetězení fází · soubory = předání">
            <PhaseChain agents={agents} pipeline={selected} />
          </HudPanel>
        </Stack>
      )}

      {runPipeline && (
        <PipelineRunModal
          agents={agents}
          key={runPipeline.id}
          onClose={() => setRunPipeline(null)}
          pipeline={runPipeline}
          projects={[...PROJECTS]}
        />
      )}
      {addModal}
    </Grid>
  );
}
