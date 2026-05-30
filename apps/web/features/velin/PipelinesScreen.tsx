"use client"

import { useState } from "react"
import {
  Button,
  HudPanel,
  Icon,
  PhaseChain,
  PipelineCard,
  PipelineRunModal,
  Pill,
  SectionLabel,
  type ContextName,
  type Pipeline,
} from "@zibby/design-system"
import { AGENTS, PROJECTS } from "./fixtures"
import { usePipelinesQuery } from "./queries"

export interface PipelinesScreenProps {
  context: ContextName
}

/** Orchestrace: master list of pipelines + detail with the visual phase chain. */
export function PipelinesScreen({ context }: PipelinesScreenProps) {
  const { data: list = [] } = usePipelinesQuery(context)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runPipeline, setRunPipeline] = useState<Pipeline | null>(null)

  const selected = list.find((p) => p.id === selectedId) ?? list[0]

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* left: list */}
      <div className="flex flex-col gap-3">
        <SectionLabel
          action={
            <Button intent="ghost" icon="plus" size="sm">
              Přidat pipeline
            </Button>
          }
        >
          Pipeline · {context}
        </SectionLabel>
        {list.map((p) => (
          <PipelineCard
            key={p.id}
            pipeline={p}
            agents={AGENTS}
            selected={p.id === (selected?.id ?? "")}
            onSelect={setSelectedId}
          />
        ))}
        {list.length === 0 && (
          <span className="p-4 font-mono text-base text-foreground-faint">
            Žádné pipeline v kontextu {context}.
          </span>
        )}
      </div>

      {/* right: detail */}
      {selected && (
        <div className="flex flex-col gap-5">
          <HudPanel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-3xl font-semibold">{selected.name}</span>
                  <Pill tone="accent">{context}</Pill>
                </div>
                <span className="mt-1.5 block font-mono text-caption text-foreground-dim">
                  {selected.desc}
                </span>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <Icon name="file" size={12} className="text-foreground-faint" />
                  <span className="font-mono text-sm text-foreground-faint">{selected.file}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button intent="ghost" icon="edit" size="sm">
                  Editovat
                </Button>
                <Button intent="ghost" icon="link" size="sm">
                  Duplikovat
                </Button>
                <Button intent="run" icon="play" onClick={() => setRunPipeline(selected)}>
                  Spustit pipeline
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-5 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                <Icon name="dollar" size={16} className="text-accent" />
                <div>
                  <span className="block font-mono text-2xs tracking-wider text-foreground-faint">
                    STROP PIPELINE
                  </span>
                  <span className="font-mono text-xl font-bold text-foreground">
                    ${selected.budget}
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Icon name="branch" size={16} className="text-foreground-dim" />
                <span className="font-mono text-caption text-foreground-dim">
                  výstup → izolovaná branch · PR k ranní review
                </span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Icon name="checkpoint" size={16} className="text-foreground-dim" />
                <span className="font-mono text-caption text-foreground-dim">
                  checkpoint po každé fázi
                </span>
              </div>
            </div>
          </HudPanel>

          <HudPanel title="zřetězení fází · soubory = předání" className="p-5">
            <PhaseChain pipeline={selected} agents={AGENTS} />
          </HudPanel>
        </div>
      )}

      {runPipeline && (
        <PipelineRunModal
          key={runPipeline.id}
          pipeline={runPipeline}
          agents={AGENTS}
          projects={[...PROJECTS]}
          onClose={() => setRunPipeline(null)}
        />
      )}
    </div>
  )
}
