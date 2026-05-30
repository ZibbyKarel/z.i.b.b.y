import type { CSSProperties, ReactNode } from "react"
import { cn } from "../../lib/cn"
import { contextStyle } from "../../theme/context"
import type {
  AgentSdkCredit,
  ClaudeLimits,
  ContextName,
  NavItem,
} from "../../domain"
import { Sidebar } from "../Sidebar/Sidebar"
import { TopBar } from "../TopBar/TopBar"

const gridOverlay: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
  WebkitMaskImage:
    "radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)",
  maskImage:
    "radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)",
}

const scanOverlay: CSSProperties = {
  mixBlendMode: "overlay",
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
}

export interface VelinShellProps {
  context: ContextName
  onContextChange: (context: ContextName) => void
  navItems: NavItem[]
  activeNav: string
  onNavigate: (id: string) => void
  footerItem?: NavItem
  breadcrumb: string
  limits: ClaudeLimits
  credit: AgentSdkCredit
  onCommand?: () => void
  children: ReactNode
}

/**
 * The full velín chrome: angular HUD background (grid + scanlines), left
 * Sidebar, always-visible TopBar and a scrollable content area. The active
 * context (home / work) drives the `accent` token via CSS variables on the root.
 */
export function VelinShell({
  context,
  onContextChange,
  navItems,
  activeNav,
  onNavigate,
  footerItem,
  breadcrumb,
  limits,
  credit,
  onCommand,
  children,
}: VelinShellProps) {
  return (
    <div
      style={contextStyle(context)}
      className="relative h-full w-full overflow-hidden bg-surface-1 font-sans text-foreground"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35"
        style={gridOverlay}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={scanOverlay}
      />

      <div className="relative z-[1] flex h-full">
        <Sidebar
          items={navItems}
          active={activeNav}
          onNavigate={onNavigate}
          footerItem={footerItem}
        />
        <div className={cn("flex min-w-0 flex-1 flex-col")}>
          <TopBar
            context={context}
            onContextChange={onContextChange}
            breadcrumb={breadcrumb}
            limits={limits}
            credit={credit}
            onCommand={onCommand}
          />
          <div className="relative flex-1 overflow-auto px-7 py-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
