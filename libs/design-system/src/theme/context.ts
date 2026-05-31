import type { CSSProperties } from "react"
import { type ContextName, contextVars } from "./tokens"

export type { ContextName }

/**
 * Returns the inline CSS-variable style that switches the active context
 * accent (home = amber, work = blue). Apply it to any wrapper; every
 * `accent` / `accent-dim` token below it resolves to the context color.
 */
export function contextStyle(context: ContextName): CSSProperties {
  return contextVars[context] as CSSProperties
}
