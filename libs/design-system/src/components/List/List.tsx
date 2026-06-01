import type { ComponentType, ReactNode } from "react";
import { cn } from "../../utils/cn";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";

export type LinkComponentType = ComponentType<{
  href: string;
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}>;

/** A single navigation entry — chrome-level, domain-neutral. */
export interface ListItem {
  id: string;
  label: string;
  glyph: IconName;
  badge?: number;
  /** Optional URL for link-based navigation (used with linkComponent). */
  href?: string;
}

interface ListRowProps {
  item: ListItem;
  active: boolean;
  onSelect: (id: string) => void;
  linkComponent?: LinkComponentType;
}

function ListRow({
  item,
  active,
  onSelect,
  linkComponent: LinkComp,
}: ListRowProps) {
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
      <span
        className={cn("flex", active ? "text-accent" : "text-foreground-faint")}
      >
        <Icon name={item.glyph} size="md" />
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
      <LinkComp
        href={item.href}
        className={className}
        aria-current={active ? "page" : undefined}
      >
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

export interface ListProps {
  items: ListItem[];
  active: string;
  onNavigate: (id: string) => void;
  footerItem?: ListItem;
  /** Optional link component for router-based navigation. */
  linkComponent?: LinkComponentType;
}

export function List({
  items,
  active,
  onNavigate,
  footerItem,
  linkComponent,
}: ListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <ListRow
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
          <ListRow
            item={footerItem}
            active={footerItem.id === active}
            onSelect={onNavigate}
            linkComponent={linkComponent}
          />
        </div>
      )}
    </div>
  );
}
