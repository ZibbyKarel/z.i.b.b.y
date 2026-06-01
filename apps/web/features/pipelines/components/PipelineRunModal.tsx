"use client";
import { useState } from "react"
import {
  cn,
  Button,
  Icon,
  glyphForAgent,
  type AgentDef,
  type ModelName,
  type Pipeline,
  type ThinkingLevel,
} from "@zibby/design-system"
import { ModelBadge, ThinkBadge } from "./PhaseChain"

const CYCLE_MODEL: ModelName[] = ["opus", "sonnet", "haiku"]
const CYCLE_THINK: ThinkingLevel[] = ["high", "medium", "low"]
const next = <T,>(arr: T[], v: T): T => arr[(arr.indexOf(v) + 1) % arr.length]!

interface Override {
  model: ModelName
  thinking: ThinkingLevel
}

export interface PipelineRunModalProps {
  pipeline: Pipeline
  agents: AgentDef[]
  projects: string[]
  onClose: () => void
  onLaunch?: (req: {
    pipeline: Pipeline
    prompt: string
    project: string
    budget: number
    overrides: Override[]
  }) => void
}

/**
 * Launch modal for a multi-agent pipeline: prompt, target project, budget cap
 * and per-agent model / thinking overrides (clickable badges). Mount with a
 * `key={pipeline.id}` so state initialises against the selected pipeline.
 */
export function PipelineRunModal({
  pipeline,
  agents,
  projects,
  onClose,
  onLaunch,
}: PipelineRunModalProps) {
  const [prompt, setPrompt] = useState("")
  const [project, setProject] = useState(projects[0] ?? "")
  const [budget, setBudget] = useState(pipeline.budget)
  const [overrides, setOverrides] = useState<Override[]>(
    pipeline.phases.map((p) => ({ model: p.model, thinking: p.thinking })),
  )
  const [launched, setLaunched] = useState(false)

  function cycleModel(i: number) {
    setOverrides((o) => o.map((x, j) => (j === i ? { ...x, model: next(CYCLE_MODEL, x.model) } : x)))
  }
  function cycleThink(i: number) {
    setOverrides((o) =>
      o.map((x, j) => (j === i ? { ...x, thinking: next(CYCLE_THINK, x.thinking) } : x)),
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Spustit pipeline ${pipeline.name}`}
      onClick={onClose}
      className="absolute inset-0 z-[100] flex animate-fade-in items-center justify-center bg-[rgba(5,7,10,0.72)] p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90%] w-[580px] max-w-full animate-scale-in overflow-auto rounded-md border border-border-strong bg-raised shadow-modal"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-sm border border-accent/30 bg-accent-dim text-accent">
            <Icon name="flow" size="lg" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-xl font-bold text-foreground">
              Spustit · {pipeline.name}
            </div>
            <div className="text-base text-foreground-dim">
              {pipeline.phases.length} fází · víceagentní běh na pozadí
            </div>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="flex p-1 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Icon name="x" size="md" />
          </button>
        </div>

        {!launched ? (
          <div className="p-5">
            <label
              htmlFor="pipeline-prompt"
              className="font-mono text-sm uppercase tracking-wider text-foreground-faint"
            >
              Zadání
            </label>
            <textarea
              id="pipeline-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
              placeholder={`Co má pipeline „${pipeline.name}" udělat…`}
              className="mt-2 min-h-[84px] w-full resize-y rounded border border-border bg-background px-3.5 py-3 font-sans text-md leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />

            <div className="mt-4 grid grid-cols-2 gap-5">
              <div>
                <span className="font-mono text-sm uppercase tracking-wider text-foreground-faint">
                  Cílový projekt
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {projects.slice(0, 4).map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={project === p}
                      onClick={() => setProject(p)}
                      className={cn(
                        "rounded-sm border px-2 py-1 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        project === p
                          ? "border-accent bg-accent text-accent-contrast"
                          : "border-border text-foreground-dim hover:text-foreground",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="font-mono text-sm uppercase tracking-wider text-foreground-faint">
                  Rozpočet (strop)
                </span>
                <div className="mt-2 flex items-center gap-1.5">
                  {[10, 25, 50].map((b) => (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={budget === b}
                      onClick={() => setBudget(b)}
                      className={cn(
                        "rounded-sm border px-2.5 py-1 font-mono text-caption outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        budget === b
                          ? "border-accent bg-accent text-accent-contrast"
                          : "border-border text-foreground-dim hover:text-foreground",
                      )}
                    >
                      ${b}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <span className="mt-4 block font-mono text-sm uppercase tracking-wider text-foreground-faint">
              Override modelu / thinking pro tenhle běh
            </span>
            <div className="mt-2 overflow-hidden rounded border border-border">
              {pipeline.phases.map((ph, i) => (
                <div
                  key={`${ph.agent}-${i}`}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2",
                    i < pipeline.phases.length - 1 && "border-b border-border",
                    i % 2 === 0 && "bg-[rgba(255,255,255,0.015)]",
                  )}
                >
                  <Icon
                    name={glyphForAgent(ph.agent, agents)}
                    size="sm"
                    className="text-accent"
                  />
                  <span className="flex-1 font-mono text-caption text-foreground">{ph.agent}</span>
                  <button
                    type="button"
                    onClick={() => cycleModel(i)}
                    aria-label={`Změnit model pro ${ph.agent}`}
                    className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ModelBadge model={overrides[i]!.model} />
                  </button>
                  <button
                    type="button"
                    onClick={() => cycleThink(i)}
                    aria-label={`Změnit thinking pro ${ph.agent}`}
                    className="outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ThinkBadge level={overrides[i]!.thinking} />
                  </button>
                </div>
              ))}
            </div>
            <span className="mt-2 block font-mono text-xs text-foreground-faint">
              klikni na badge pro override · defaulty z agent.md, push do branche čeká na tvé schválení
            </span>

            <div className="mt-4 flex items-center justify-between">
              <Button intent="ghost" icon="edit">
                Edit raw .pipeline.md
              </Button>
              <Button
                intent="run"
                icon="play"
                onClick={() => {
                  onLaunch?.({ pipeline, prompt, project, budget, overrides })
                  setLaunched(true)
                }}
              >
                Spustit · max ${budget}
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-6 pt-8 text-center">
            <div className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full border-[1.5px] border-accent text-accent shadow-glow-accent">
              <Icon name="flow" size="lg" />
            </div>
            <div className="mt-4 text-xl font-semibold text-foreground">
              Pipeline spuštěna na pozadí
            </div>
            <span className="mt-1.5 block font-mono text-base text-foreground-dim">
              {pipeline.name} → {project} · strop ${budget}
            </span>
            <div className="mt-2 text-md text-foreground-dim">
              Sleduj fáze v sekci <span className="text-accent">Běžící agenti</span> · pracuje v
              izolované branchi.
            </div>
            <div className="mt-5 inline-flex">
              <Button intent="ghost" icon="pulse" onClick={onClose}>
                Zavřít
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
