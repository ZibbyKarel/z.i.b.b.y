import type { ComponentType, CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { ContextName } from "../../DesignSystemContext/contextTokens";
import { Sidebar } from "../Sidebar/Sidebar";
import type { NavItem } from "../Sidebar/Sidebar";
import { TopBar } from "../TopBar/TopBar";

const gridOverlay: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
  WebkitMaskImage:
    "radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)",
  maskImage:
    "radial-gradient(ellipse 100% 90% at 60% 0%, #000 20%, transparent 85%)",
};

const scanOverlay: CSSProperties = {
  mixBlendMode: "overlay",
  backgroundImage:
    "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
};

export type LinkComponentType = ComponentType<{
  href: string;
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}>;

export interface DashboardShellProps {
  context: ContextName;
  onContextChange: (context: ContextName) => void;
  navItems: NavItem[];
  activeNav: string;
  onNavigate: (id: string) => void;
  footerItem?: NavItem;
  breadcrumb: string;
  /** Right-aligned top-bar slot — the app injects its domain wallet/limits widget. */
  walletSlot?: ReactNode;
  onCommand?: () => void;
  /** Optional link component for router-based nav (e.g. Next.js Link). */
  linkComponent?: LinkComponentType;
  children: ReactNode;
}

/**
 * Full dashboard chrome: angular HUD background (grid + scanlines), left
 * Sidebar, always-visible TopBar and a scrollable content area.
 * Context accent is applied by DesignSystemProvider wrapping this component.
 */
export function DashboardShell({
  context,
  onContextChange,
  navItems,
  activeNav,
  onNavigate,
  footerItem,
  breadcrumb,
  walletSlot,
  onCommand,
  linkComponent,
  children,
}: DashboardShellProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-1 font-sans text-foreground">
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
          linkComponent={linkComponent}
        />
        <div className={cn("flex min-w-0 flex-1 flex-col")}>
          <TopBar
            context={context}
            onContextChange={onContextChange}
            breadcrumb={breadcrumb}
            walletSlot={walletSlot}
            onCommand={onCommand}
          />
          <div className="relative flex-1 overflow-auto px-7 py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
