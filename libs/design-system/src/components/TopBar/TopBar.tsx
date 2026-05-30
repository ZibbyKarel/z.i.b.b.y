import { cn } from "../../lib/cn"
import type { AgentSdkCredit, ClaudeLimits, ContextName } from "../../domain"
import { ContextSwitch } from "../ContextSwitch/ContextSwitch"
import { Icon } from "../Icon/Icon"
import { LimitsWidget } from "../LimitsWidget/LimitsWidget"

export interface TopBarProps {
  context: ContextName
  onContextChange: (context: ContextName) => void
  /** Current screen label, shown as a breadcrumb. */
  breadcrumb: string
  limits: ClaudeLimits
  credit: AgentSdkCredit
  /** Invoked by the ⌘K command affordance. */
  onCommand?: () => void
  className?: string
}

/**
 * The always-visible top bar: context switch + breadcrumb on the left, command
 * palette trigger and the dual-wallet limits widget on the right.
 */
export function TopBar({
  context,
  onContextChange,
  breadcrumb,
  limits,
  credit,
  onCommand,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "relative z-20 flex h-16 shrink-0 items-center gap-3.5 border-b border-border bg-surface-1 px-6",
        className,
      )}
    >
      <ContextSwitch context={context} onContextChange={onContextChange} />
      <div className="flex items-center gap-2 text-foreground-faint">
        <Icon name="chevron" size={13} />
        <span className="font-mono text-base text-foreground-dim">{breadcrumb}</span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        title="Příkaz nebo skill (⌘K)"
        aria-label="Příkaz nebo skill"
        onClick={onCommand}
        className="flex items-center gap-2 rounded border border-border bg-surface-0 px-3 py-2 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name="search" size={14} />
        <span className="rounded-sm border border-border px-1.5 py-px font-mono text-sm text-foreground-faint">
          ⌘K
        </span>
      </button>
      <LimitsWidget limits={limits} credit={credit} />
    </header>
  )
}
