import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { NavItem } from "../../domain";
import type { LinkComponentType } from "../DashboardShell/DashboardShell";
import { Icon } from "../Icon/Icon";
import { ZibbyMark } from "../Icon/Icon";

interface NavRowProps {
  item: NavItem;
  active: boolean;
  onSelect: (id: string) => void;
  linkComponent?: LinkComponentType;
}

function NavRow({ item, active, onSelect, linkComponent: LinkComp }: NavRowProps) {
  const className = cn(
    "relative flex w-full items-center gap-3 rounded px-3 py-2 text-left text-lg outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-accent",
    active
      ? "bg-[rgba(255,255,255,0.04)] font-semibold text-foreground"
      : "font-medium text-foreground-dim hover:text-foreground",
  );

  const inner: ReactNode = (
    <>
      {active && (
        <span className="absolute -left-3.5 bottom-2 top-2 w-[3px] rounded bg-accent shadow-glow-accent" />
      )}
      <span className={cn("flex", active ? "text-accent" : "text-foreground-faint")}>
        <Icon name={item.glyph} size={17} />
      </span>
      <span className="flex-1">{item.label}</span>
      {item.badge ? (
        <span className="rounded-full bg-accent px-2 py-px font-mono text-sm font-bold text-accent-contrast">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  if (LinkComp && item.href) {
    return (
      <LinkComp href={item.href} className={className} aria-current={active ? "page" : undefined}>
        {inner}
      </LinkComp>
    );
  }

  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={() => onSelect(item.id)}
      className={className}
    >
      {inner}
    </button>
  );
}

export interface SidebarProps {
  items: NavItem[];
  active: string;
  onNavigate: (id: string) => void;
  footerItem?: NavItem;
  className?: string;
  /** Optional link component for router-based navigation. */
  linkComponent?: LinkComponentType;
  /** Accessible label for the nav landmark (pass via t() for i18n). */
  navLabel?: string;
}

export function Sidebar({
  items,
  active,
  onNavigate,
  footerItem,
  className,
  linkComponent,
  navLabel = "Main navigation",
}: SidebarProps) {
  return (
    <nav
      aria-label={navLabel}
      className={cn(
        "flex w-56 shrink-0 flex-col border-r border-border bg-surface-0 px-3.5 py-6",
        className,
      )}
    >
      {/* brand */}
      <div className="px-1.5 pb-6 pt-1">
        <div className="flex items-center gap-3">
          <ZibbyMark size={26} />
          <div className="font-mono text-2xl font-bold tracking-mono text-foreground">
            Z<span className="text-foreground-faint">·</span>I
            <span className="text-foreground-faint">·</span>B
            <span className="text-foreground-faint">·</span>B
            <span className="text-foreground-faint">·</span>Y
          </div>
        </div>
        <div className="mt-2 whitespace-nowrap font-mono text-2xs tracking-tighter text-foreground-faint">
          Zestful Intuitive Brainy Butler for You
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={item.id === active}
            onSelect={onNavigate}
            linkComponent={linkComponent}
          />
        ))}
      </div>

      {footerItem && (
        <div className="mt-auto border-t border-border pt-3">
          <NavRow
            item={footerItem}
            active={footerItem.id === active}
            onSelect={onNavigate}
            linkComponent={linkComponent}
          />
        </div>
      )}
    </nav>
  );
}
