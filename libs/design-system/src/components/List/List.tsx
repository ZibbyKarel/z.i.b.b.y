import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import { Stack } from "../Stack/Stack";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";

export enum ListTestId {
  Root = "list-root",
  /** Suffix with item key when consumer needs per-item selection, e.g. `list-item-overview`. */
  Item = "list-item",
  /** Suffix with item key when consumer needs per-badge selection, e.g. `list-item-badge-runs`. */
  Badge = "list-item-badge",
}

export type LinkComponentType = ComponentType<{
  href: string;
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}>;

/** Navigation item data shape — used by app-level nav config arrays. */
export interface NavItem {
  id: string;
  label: string;
  glyph: IconName;
  badge?: number;
  href?: string;
}

interface ListItemCtxValue {
  active: boolean;
}
const ListItemCtx = createContext<ListItemCtxValue>({ active: false });

// --- Sub-components ---

export interface ListItemIconProps {
  glyph: IconName;
}

export function ListItemIcon({ glyph }: ListItemIconProps) {
  const { active } = useContext(ListItemCtx);
  return (
    <span className={cn("flex", active ? "text-accent" : "text-foreground-faint")}>
      <Icon name={glyph} size="md" />
    </span>
  );
}

export function ListItemText({ children }: { children: ReactNode }) {
  return <span className="flex-1">{children}</span>;
}

export type ListItemBadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "className">;

export function ListItemBadge({ children, ...rest }: ListItemBadgeProps) {
  return (
    <span
      data-testid={ListTestId.Badge}
      {...rest}
      className="rounded-full bg-accent px-2 py-px font-mono text-sm font-bold text-accent-contrast"
    >
      {children}
    </span>
  );
}

// --- ListItem ---

export type ListItemProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "className" | "onClick"
> & {
  active?: boolean;
  onSelect?: () => void;
  href?: string;
  linkComponent?: LinkComponentType;
};

export function ListItem({
  active = false,
  onSelect,
  href,
  linkComponent: LinkComp,
  children,
  ...rest
}: ListItemProps) {
  const className = cn(
    "relative flex w-full items-center gap-3 rounded px-3 py-2 text-left text-lg outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-accent",
    active
      ? "bg-[rgba(255,255,255,0.04)] font-semibold text-foreground"
      : "font-medium text-foreground-dim hover:text-foreground",
  );

  const inner = (
    <ListItemCtx.Provider value={{ active }}>
      {active && (
        <span className="absolute -left-3.5 bottom-2 top-2 w-[3px] rounded bg-accent shadow-glow-accent" />
      )}
      {children}
    </ListItemCtx.Provider>
  );

  if (LinkComp && href) {
    return (
      <LinkComp
        href={href}
        data-testid={ListTestId.Item}
        {...rest}
        aria-current={active ? "page" : undefined}
        className={className}
      >
        {inner}
      </LinkComp>
    );
  }

  if (onSelect) {
    return (
      <button
        type="button"
        data-testid={ListTestId.Item}
        {...rest}
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
        className={className}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      data-testid={ListTestId.Item}
      {...rest}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {inner}
    </div>
  );
}

// --- List container ---

export interface ListProps {
  children: ReactNode;
}

export function List({ children }: ListProps) {
  return (
    <Stack data-testid={ListTestId.Root} gap="25">
      {children}
    </Stack>
  );
}
