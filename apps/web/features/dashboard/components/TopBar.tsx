import type { ReactNode } from "react"
import {
  cn,
  ButtonGroup,
  Icon,
} from "@zibby/design-system"
import type { ButtonGroupOption } from "@zibby/design-system"
import type { ContextName } from "@zibby/design-system"

const CONTEXT_OPTIONS: ButtonGroupOption[] = [
  {
    id: "home",
    label: "home",
    swatchClass: "bg-home",
    activeClass: "bg-home text-background shadow-[0_0_14px_rgba(240,180,41,0.33)]",
  },
  {
    id: "work",
    label: "work",
    swatchClass: "bg-work",
    activeClass: "bg-work text-background shadow-[0_0_14px_rgba(91,141,239,0.33)]",
  },
]

export interface TopBarProps {
  context: ContextName
  onContextChange: (context: ContextName) => void
  breadcrumb: string
  walletSlot?: ReactNode
  onCommand?: () => void
  className?: string
}

export function TopBar({
  context,
  onContextChange,
  breadcrumb,
  walletSlot,
  onCommand,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "relative z-20 flex h-16 shrink-0 items-center gap-3.5 border-b border-border bg-surface px-6",
        className,
      )}
    >
      <ButtonGroup
        options={CONTEXT_OPTIONS}
        value={context}
        onChange={(v) => onContextChange(v as ContextName)}
        ariaLabel="Přepínač kontextu"
      />
      <div className="flex items-center gap-2 text-foreground-faint">
        <Icon name="chevron" size="sm" />
        <span className="font-mono text-base text-foreground-dim">{breadcrumb}</span>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        title="Příkaz nebo skill (⌘K)"
        aria-label="Příkaz nebo skill"
        onClick={onCommand}
        className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-foreground-faint outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Icon name="search" size="sm" />
        <span className="rounded-sm border border-border px-1.5 py-px font-mono text-sm text-foreground-faint">
          ⌘K
        </span>
      </button>
      {walletSlot}
    </header>
  )
}
