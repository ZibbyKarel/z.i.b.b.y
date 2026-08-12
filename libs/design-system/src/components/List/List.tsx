"use client";

import { type ReactNode, createContext, useContext } from "react";
import { cn } from "../../utils/cn";
import { focusRing } from "../../utils/focus";
import { Stack } from "../Stack/Stack";
import type { IconName } from "../Icon/Icon";
import { Icon } from "../Icon/Icon";

export enum ListTestId {
  Root = "list-root",
  Item = "list-item",
  Badge = "list-item-badge",
  Icon = "list-item-icon",
}

/** Navigation item data shape — used by app-level nav config arrays. */
export interface NavItem {
  id: string;
  label: string;
  glyph: IconName;
  badge?: number;
  /** Accessible label for the badge (e.g. "3 items need attention"). */
  badgeLabel?: string;
  href?: string;
}

interface ListItemCtxValue {
  active: boolean;
  /** The owning `ListItem`'s stable key (its `id`, when the consumer passes one) —
   *  threaded down so `ListItemIcon`/`ListItemBadge` can suffix their own testid
   *  the same way, without each needing its own id prop. */
  testKey?: string;
}
const ListItemCtx = createContext<ListItemCtxValue>({ active: false });

// --- Sub-components ---

export interface ListItemIconProps {
  glyph: IconName;
}

export function ListItemIcon({ glyph }: ListItemIconProps) {
  const { active, testKey } = useContext(ListItemCtx);
  return (
    <span
      className={cn("flex", active ? "text-accent" : "text-foreground-faint")}
      data-testid={testKey ? `${ListTestId.Icon}-${testKey}` : ListTestId.Icon}
    >
      <Icon name={glyph} size="md" />
    </span>
  );
}

export function ListItemText({ children }: { children: ReactNode }) {
  return <span className="flex-1">{children}</span>;
}

export type ListItemBadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "className">;

export function ListItemBadge({ children, ...rest }: ListItemBadgeProps) {
  const { testKey } = useContext(ListItemCtx);
  return (
    <span
      data-testid={testKey ? `${ListTestId.Badge}-${testKey}` : ListTestId.Badge}
      {...rest}
      className="rounded-full bg-accent px-2 py-px font-mono text-sm font-bold text-accent-contrast"
    >
      {children}
    </span>
  );
}

// --- ListItem ---

export type ListItemProps = Omit<React.HTMLAttributes<HTMLElement>, "className" | "onClick"> & {
  active?: boolean;
  onSelect?: () => void;
};

export function ListItem({ active = false, onSelect, children, id, ...rest }: ListItemProps) {
  const className = cn(
    "relative flex w-full items-center gap-3 rounded px-3 py-2 text-left text-lg transition-colors",
    focusRing,
    active
      ? "bg-hover font-semibold text-foreground"
      : "font-medium text-foreground-dim hover:text-foreground",
  );
  // Repeated rows (nav lists, option lists) share the enum's static value unless
  // the consumer gives the row a stable `id` — the same convention SchedulePicker
  // uses for its weekday toggles (`${TestId.Part}-${key}`). No `id` falls back to
  // the static member, selectable with `getAllByTestId` + index.
  const testId = id ? `${ListTestId.Item}-${id}` : ListTestId.Item;

  const inner = (
    <ListItemCtx.Provider value={{ active, testKey: id }}>
      {active && (
        <span className="absolute -left-3.5 bottom-2 top-2 w-[3px] rounded bg-accent shadow-glow-accent" />
      )}
      {children}
    </ListItemCtx.Provider>
  );

  if (onSelect) {
    return (
      <button
        data-testid={testId}
        {...rest}
        aria-current={active ? "page" : undefined}
        className={className}
        id={id}
        onClick={onSelect}
        type="button"
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      data-testid={testId}
      {...rest}
      aria-current={active ? "page" : undefined}
      className={className}
      id={id}
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
