import { useState } from "react"
import { cn } from "../../lib/cn"
import type { Skill } from "../../domain"
import { Button } from "../Button/Button"
import { Icon } from "../Icon/Icon"

export interface RunModalProps {
  /** Skill to run; the modal renders only when set. */
  skill: Skill
  /** Selectable target projects (from projects.json). */
  projects: string[]
  onClose: () => void
  /** Called with the composed run request when the user launches. */
  onLaunch?: (req: { skill: Skill; prompt: string; project: string }) => void
}

/**
 * The recurring velín interaction: write a prompt, pick a target project, see
 * the backing SKILL.md path, then launch a background agent. Mounted only when
 * a skill is selected (mount with a `key` to reset state per skill).
 */
export function RunModal({ skill, projects, onClose, onLaunch }: RunModalProps) {
  const [prompt, setPrompt] = useState("")
  const [project, setProject] = useState(projects[0] ?? "")
  const [launched, setLaunched] = useState(false)

  function launch() {
    onLaunch?.({ skill, prompt, project })
    setLaunched(true)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Spustit ${skill.name}`}
      onClick={onClose}
      className="absolute inset-0 z-[100] flex animate-fade-in items-center justify-center bg-[rgba(5,7,10,0.72)] p-6 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[540px] max-w-full animate-scale-in overflow-hidden rounded-md border border-border-hi bg-panel-hi shadow-modal"
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-sm border border-accent/30 bg-accent-dim text-accent">
            <Icon name={skill.glyph} size={19} />
          </div>
          <div className="flex-1">
            <div className="font-mono text-xl font-bold text-foreground">{skill.name}</div>
            <div className="text-base text-foreground-dim">{skill.desc}</div>
          </div>
          <button
            type="button"
            aria-label="Zavřít"
            onClick={onClose}
            className="flex p-1 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {!launched ? (
          <div className="p-5">
            <label
              htmlFor="run-prompt"
              className="font-mono text-sm uppercase tracking-wider text-foreground-faint"
            >
              Zadání / prompt
            </label>
            <textarea
              id="run-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              autoFocus
              placeholder={`Řekni ${skill.name}, co má udělat…`}
              className="mt-2 min-h-24 w-full resize-y rounded border border-border bg-surface-0 px-3.5 py-3 font-sans text-md leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />

            <span className="mt-4 block font-mono text-sm uppercase tracking-wider text-foreground-faint">
              Cílový projekt
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {projects.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={project === p}
                  onClick={() => setProject(p)}
                  className={cn(
                    "rounded-sm border px-2.5 py-1.5 font-mono text-caption outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    project === p
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-transparent text-foreground-dim hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded border border-border bg-surface-0 px-3 py-2.5">
              <Icon name="file" size={13} className="text-foreground-faint" />
              <span className="font-mono text-caption text-foreground-faint">{skill.file}</span>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <Button intent="ghost" icon="edit">
                Edit raw SKILL.md
              </Button>
              <Button intent="run" icon="play" onClick={launch}>
                Spustit agenta
              </Button>
            </div>
          </div>
        ) : (
          <div className="px-5 pb-6 pt-8 text-center">
            <div className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full border-[1.5px] border-accent text-accent shadow-glow-accent">
              <Icon name="play" size={22} stroke={2} />
            </div>
            <div className="mt-4 text-xl font-semibold text-foreground">
              Agent spuštěn na pozadí
            </div>
            <span className="mt-1.5 block font-mono text-base text-foreground-dim">
              {skill.name} → {project}
            </span>
            <div className="mt-2 text-md text-foreground-dim">
              Sleduj ho v sekci <span className="text-accent">Běžící agenti</span>.
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
