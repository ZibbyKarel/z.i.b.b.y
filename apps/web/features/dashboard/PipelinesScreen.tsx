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
import { useDashboardContext } from "./dashboardContext";
import { hrefWithCtx } from "./DashboardChrome";

export interface PipelinesScreenProps {
  /** Pre-selected pipeline id from the [id] route segment. */
  selectedId?: string;
}

export function PipelinesScreen({ selectedId: routeId }: PipelinesScreenProps) {
  const { context } = useDashboardContext();
  const { pipelines, agents, addPipeline } = useDashboardStore();
  const [runPipeline, setRunPipeline] = useState<Pipeline | null>(null);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  const list = pipelines.filter((p) => p.ctx === context);
  const selected = (routeId ? list.find((p) => p.id === routeId) : null) ?? list[0];

  const addModal = adding && (
    <EntityFormModal
      title={PIPELINE_FORM.title}
      subtitle={PIPELINE_FORM.subtitle}
      glyph={PIPELINE_FORM.glyph}
      fields={PIPELINE_FORM.fields}
      submitLabel={PIPELINE_FORM.submitLabel}
      filePreview={PIPELINE_FORM.filePreview}
      onClose={() => setAdding(false)}
      onSubmit={(values) => { addPipeline(values); setAdding(false); }}
    />
  );

  const addAction = (
    <Button intent="run" icon="plus" size="sm" onClick={() => setAdding(true)}>
      Přidat pipeline
    </Button>
  );

  if (list.length === 0) {
    return (
      <Container maxWidth="1400px" style={{ marginInline: "auto" }}>
        <SectionLabel action={addAction}>Pipeline · {context}</SectionLabel>
        <EmptyState
          glyph="flow"
          title="Zatím žádné pipeline"
          description="Pipeline řetězí agenty přes soubory. Přidej první a fáze pak poskládáš v editoru."
          actionLabel="Přidat pipeline"
          onAction={() => setAdding(true)}
          hint="// vytvoří ~/zibby/pipelines/<název>.pipeline.md"
        />
        {addModal}
      </Container>
    );
  }

  const rawCtx = context;

  return (
    <Grid sidebar="left" center maxWidth="1400px" gap="250" align="start">
      <Stack gap="150">
        <SectionLabel action={addAction}>Pipeline · {context}</SectionLabel>
        {list.map((p) => (
          <PipelineCard
            key={p.id}
            pipeline={p}
            agents={agents}
            selected={p.id === (selected?.id ?? "")}
            onSelect={(id: string) => router.push(hrefWithCtx(`/pipelines/${id}`, rawCtx))}
          />
        ))}
      </Stack>

      {selected && (
        <Stack gap="250">
          <HudPanel padding="250">
            <Stack gap="200">
              <Stack direction="row" wrap align="start" justify="between" gap="200">
                <Container minW0>
                  <Stack gap="100">
                    <Stack direction="row" align="center" gap="100">
                      <Typography type="title" size="3xl" weight="semibold">
                        {selected.name}
                      </Typography>
                      <Chip tone="accent">{context}</Chip>
                    </Stack>
                    <Typography type="note" mono size="caption" variant="secondary">
                      {selected.desc}
                    </Typography>
                    <Stack direction="row" align="center" gap="75">
                      <Icon name="file" size="xs" tone="faint" />
                      <Typography type="note" mono size="sm" variant="tertiary">
                        {selected.file}
                      </Typography>
                    </Stack>
                  </Stack>
                </Container>
                <Stack direction="row" align="center" gap="100">
                  <Button intent="ghost" icon="edit" size="sm">Editovat</Button>
                  <Button intent="ghost" icon="link" size="sm">Duplikovat</Button>
                  <Button intent="run" icon="play" onClick={() => setRunPipeline(selected)}>
                    Spustit pipeline
                  </Button>
                </Stack>
              </Stack>
              <Divider />
              <Stack direction="row" wrap align="center" gap="250">
                <Stack direction="row" align="center" gap="100">
                  <Icon name="dollar" size="md" tone="accent" />
                  <Container>
                    <Typography type="note" mono size="2xs" tracking="wider" variant="tertiary">
                      STROP PIPELINE
                    </Typography>
                    <Typography type="note" mono size="xl" weight="bold">
                      ${selected.budget}
                    </Typography>
                  </Container>
                </Stack>
                <Container height="32px">
                  <Divider orientation="vertical" />
                </Container>
                <Stack direction="row" align="center" gap="100">
                  <Icon name="branch" size="md" tone="dim" />
                  <Typography type="note" mono size="caption" variant="secondary">
                    výstup → izolovaná branch · PR k ranní review
                  </Typography>
                </Stack>
              </Stack>
            </Stack>
          </HudPanel>

          <HudPanel title="zřetězení fází · soubory = předání" padding="250">
            <PhaseChain pipeline={selected} agents={agents} />
          </HudPanel>
        </Stack>
      )}

      {runPipeline && (
        <PipelineRunModal
          key={runPipeline.id}
          pipeline={runPipeline}
          agents={agents}
          projects={[...PROJECTS]}
          onClose={() => setRunPipeline(null)}
        />
      )}
      {addModal}
    </Grid>
  );
}
