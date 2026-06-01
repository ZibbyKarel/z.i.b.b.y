"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  EmptyState,
  EntityFormModal,
  HudPanel,
  Icon,
  PipelineCard,
  PipelineRunModal,
  Pill,
  SectionLabel,
  type Pipeline,
} from "@zibby/design-system";
import { PhaseChain } from "../pipelines/components/PhaseChain";
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

  if (list.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <SectionLabel action={<Button intent="run" icon="plus" size="sm" onClick={() => setAdding(true)}>Přidat pipeline</Button>}>
          Pipeline · {context}
        </SectionLabel>
        <EmptyState
          glyph="flow"
          title="Zatím žádné pipeline"
          description="Pipeline řetězí agenty přes soubory. Přidej první a fáze pak poskládáš v editoru."
          actionLabel="Přidat pipeline"
          onAction={() => setAdding(true)}
          hint="// vytvoří ~/zibby/pipelines/<název>.pipeline.md"
        />
        {addModal}
      </div>
    );
  }

  const rawCtx = context;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <SectionLabel action={<Button intent="run" icon="plus" size="sm" onClick={() => setAdding(true)}>Přidat pipeline</Button>}>
          Pipeline · {context}
        </SectionLabel>
        {list.map((p) => (
          <PipelineCard
            key={p.id}
            pipeline={p}
            agents={agents}
            selected={p.id === (selected?.id ?? "")}
            onSelect={(id: string) => router.push(hrefWithCtx(`/pipelines/${id}`, rawCtx))}
          />
        ))}
      </div>

      {selected && (
        <div className="flex flex-col gap-5">
          <HudPanel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl font-semibold">{selected.name}</span>
                  <Pill tone="accent">{context}</Pill>
                </div>
                <span className="mt-1.5 block font-mono text-caption text-foreground-dim">{selected.desc}</span>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Icon name="file" size={12} className="text-foreground-faint" />
                  <span className="font-mono text-sm text-foreground-faint">{selected.file}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button intent="ghost" icon="edit" size="sm">Editovat</Button>
                <Button intent="ghost" icon="link" size="sm">Duplikovat</Button>
                <Button intent="run" icon="play" onClick={() => setRunPipeline(selected)}>Spustit pipeline</Button>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Icon name="dollar" size={16} className="text-accent" />
                <div>
                  <span className="block font-mono text-2xs tracking-wider text-foreground-faint">STROP PIPELINE</span>
                  <span className="font-mono text-xl font-bold text-foreground">${selected.budget}</span>
                </div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Icon name="branch" size={16} className="text-foreground-dim" />
                <span className="font-mono text-caption text-foreground-dim">výstup → izolovaná branch · PR k ranní review</span>
              </div>
            </div>
          </HudPanel>

          <HudPanel title="zřetězení fází · soubory = předání" className="p-5">
            <PhaseChain pipeline={selected} agents={agents} />
          </HudPanel>
        </div>
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
    </div>
  );
}
