import type { CSSProperties } from "react"
import { type ContextName, contextVars } from "./tokens"

export type { ContextName }

/**
 * Returns the inline CSS-variable style that switches the active context
 * accent (home = amber, work = blue). Apply it to any wrapper; every
 * `accent` / `accent-dim` token below it resolves to the context color.
 */
export function contextStyle(context: ContextName): CSSProperties {
  const vars = contextVars[context]
  const glow =
    context === "work" ? "rgba(91,141,239,0.4)" : "rgba(240,180,41,0.4)"
  return {
    ...vars,
    "--zb-accent-glow": glow,
  } as CSSProperties
}
