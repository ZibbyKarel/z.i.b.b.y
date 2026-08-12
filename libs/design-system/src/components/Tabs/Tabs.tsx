"use client";
import type { HTMLAttributes, KeyboardEvent, ReactNode, Ref } from "react";
import { createContext, useContext, useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Row, Stack } from "../Stack/Stack";

interface TabsContextValue {
  active: string;
  setActive: (id: string) => void;
  direction: "horizontal" | "vertical";
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab must be used inside Tabs");
  return ctx;
}

export enum TabsTestId {
  Root = "tabs-root",
  List = "tabs-list",
  /** Each tab button is suffixed with its `value`, e.g. `tabs-tab-overview`. */
  Tab = "tabs-tab",
  /** Each rendered panel is suffixed with its `value`, e.g. `tabs-panel-overview`. */
  Panel = "tabs-panel",
}

export interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  direction?: "horizontal" | "vertical";
  children: ReactNode;
}

export function Tabs({
  defaultValue = "",
  value,
  onValueChange,
  direction = "horizontal",
  children,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = value ?? internal;
  const setActive = (id: string) => {
    setInternal(id);
    onValueChange?.(id);
  };
  const Root = direction === "vertical" ? Row : Stack;
  return (
    <TabsContext.Provider value={{ active, setActive, direction }}>
      <Root align="stretch" data-testid={TabsTestId.Root}>
        {children}
      </Root>
    </TabsContext.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  const { direction } = useTabsContext();
  if (direction === "vertical") {
    return (
      <div className="border-r border-border shrink-0 w-52">
        <Stack data-testid={TabsTestId.List} role="tablist">
          {children}
        </Stack>
      </div>
    );
  }
  return (
    <div className="border-b border-border shrink-0">
      <Row align="stretch" data-testid={TabsTestId.List} gap="25" role="tablist">
        {children}
      </Row>
    </div>
  );
}

export interface TabProps extends Omit<HTMLAttributes<HTMLButtonElement>, "className"> {
  value: string;
  ref?: Ref<HTMLButtonElement>;
}

/** Every non-disabled tab button inside the closest `role="tablist"` ancestor, in DOM order. */
function queryTabs(current: HTMLElement): HTMLButtonElement[] {
  const list = current.closest('[role="tablist"]');
  return list
    ? Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
    : [];
}

/**
 * WAI-ARIA APG "Tabs" roving-tabindex navigation target for a keydown on `current`.
 * `ArrowLeft`/`ArrowRight` move focus in a horizontal tablist, `ArrowUp`/`ArrowDown`
 * in a vertical one (wrapping at the ends); `Home`/`End` jump to the first/last tab.
 * Returns `null` for any other key.
 */
function nextTabTarget(
  current: HTMLButtonElement,
  key: string,
  direction: "horizontal" | "vertical",
): HTMLButtonElement | null {
  const tabs = queryTabs(current);
  if (tabs.length === 0) return null;
  const from = tabs.indexOf(current);
  const nextKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
  const prevKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";

  if (key === nextKey) return tabs[(from + 1 + tabs.length) % tabs.length] ?? null;
  if (key === prevKey) return tabs[(from - 1 + tabs.length) % tabs.length] ?? null;
  if (key === "Home") return tabs[0] ?? null;
  if (key === "End") return tabs[tabs.length - 1] ?? null;
  return null;
}

export function Tab({ value, children, ref, ...rest }: TabProps) {
  const { active, setActive, direction } = useTabsContext();
  const isActive = active === value;

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const target = nextTabTarget(e.currentTarget, e.key, direction);
    if (!target) return;
    e.preventDefault();
    const nextValue = target.dataset.tabValue;
    if (nextValue !== undefined) setActive(nextValue);
    target.focus();
  };

  if (direction === "vertical") {
    return (
      <button
        data-tab-value={value}
        data-testid={`${TabsTestId.Tab}-${value}`}
        {...rest}
        aria-selected={isActive}
        className={cn(
          "bg-transparent border-none cursor-pointer font-mono text-sm text-left w-full px-4 py-[9px]",
          "transition-[color,border-color]",
          focusRingInset,
          isActive
            ? "border-l-2 border-accent text-accent font-semibold"
            : "border-l-2 border-transparent text-foreground-dim hover:text-foreground",
        )}
        onClick={() => setActive(value)}
        onKeyDown={handleKeyDown}
        ref={ref}
        role="tab"
        tabIndex={isActive ? 0 : -1}
        type="button"
      >
        {children}
      </button>
    );
  }

  return (
    <button
      data-tab-value={value}
      data-testid={`${TabsTestId.Tab}-${value}`}
      {...rest}
      aria-selected={isActive}
      className={cn(
        "bg-transparent border-none cursor-pointer font-mono text-base -mb-px px-[14px] pt-2 pb-[7px]",
        "transition-[color,border-color]",
        focusRingInset,
        isActive
          ? "border-b-2 border-accent text-accent font-semibold"
          : "border-b-2 border-transparent text-foreground-dim hover:text-foreground",
      )}
      onClick={() => setActive(value)}
      onKeyDown={handleKeyDown}
      ref={ref}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      type="button"
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const { active } = useTabsContext();
  if (active !== value) return null;
  return (
    <div
      className="flex-1 overflow-auto"
      data-testid={`${TabsTestId.Panel}-${value}`}
      role="tabpanel"
    >
      {children}
    </div>
  );
}
