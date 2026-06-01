import type { CSSProperties, ReactNode } from "react";
import { List, TopBar } from "@zibby/design-system";
import type { ListItem, LinkComponentType } from "@zibby/design-system";
import type { ContextName } from "@zibby/design-system";
import { BrandLogo } from "./BrandLogo";

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

export interface MainLayoutProps {
  context: ContextName;
  onContextChange: (context: ContextName) => void;
  navItems: ListItem[];
  activeNav: string;
  onNavigate: (id: string) => void;
  footerItem?: ListItem;
  breadcrumb: string;
  walletSlot?: ReactNode;
  onCommand?: () => void;
  linkComponent?: LinkComponentType;
  children: ReactNode;
}

export function MainLayout({
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
}: MainLayoutProps) {
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
        <nav
          aria-label="Main navigation"
          className="flex w-56 shrink-0 flex-col border-r border-border bg-surface-0 px-3.5 py-6"
        >
          <BrandLogo />
          <List
            items={navItems}
            active={activeNav}
            onNavigate={onNavigate}
            footerItem={footerItem}
            linkComponent={linkComponent}
          />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
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
