"use client";

import {
  type ReactNode,
  createContext,
  useContext,
} from "react";
import { cn } from "../../utils/cn";
import { Stack } from "../Stack/Stack";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";

export enum ListTestId {
  Root = "list-root",
  Item = "list-item",
  Badge = "list-item-badge",
}

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
    <span
      className={cn("flex", active ? "text-accent" : "text-foreground-faint")}
    >
      <Icon name={glyph} size="md" />
    </span>
  );
}

export function ListItemText({ children }: { children: ReactNode }) {
  return <span className="flex-1">{children}</span>;
}

export type ListItemBadgeProps = Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "className"
>;

export function ListItemBadge({ children, ...rest }: ListItemBadgeProps) {
  return (
    <span
      {...rest}
      className="rounded-full bg-accent px-2 py-px font-mono text-sm font-bold text-accent-contrast"
      data-testid={ListTestId.Badge}
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
};

export function ListItem({
  active = false,
  onSelect,
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

  if (onSelect) {
    return (
      <button
        type="button"
        {...rest}
        aria-current={active ? "page" : undefined}
        className={className}
        data-testid={ListTestId.Item}
        onClick={onSelect}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      {...rest}
      aria-current={active ? "page" : undefined}
      className={className}
      data-testid={ListTestId.Item}
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
