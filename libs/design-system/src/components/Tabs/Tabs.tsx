"use client";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { createContext, useContext, useState } from "react";
import { cn } from "../../utils/cn";
import { Row, Stack } from "../Stack/Stack";

interface TabsContextValue {
  active: string;
  setActive: (id: string) => void;
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
  children: ReactNode;
}

export function Tabs({
  defaultValue = "",
  value,
  onValueChange,
  children,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = value ?? internal;
  const setActive = (id: string) => {
    setInternal(id);
    onValueChange?.(id);
  };
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <Stack data-testid={TabsTestId.Root}>{children}</Stack>
    </TabsContext.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border shrink-0">
      <Row align="stretch" data-testid={TabsTestId.List} gap="25" role="tablist">
        {children}
      </Row>
    </div>
  );
}

export interface TabProps extends Omit<
  HTMLAttributes<HTMLButtonElement>,
  "className"
> {
  value: string;
  ref?: Ref<HTMLButtonElement>;
}

export function Tab({ value, children, ref, ...rest }: TabProps) {
  const { active, setActive } = useTabsContext();
  const isActive = active === value;

  return (
    <button
      data-testid={`${TabsTestId.Tab}-${value}`}
      {...rest}
      aria-selected={isActive}
      className={cn(
        "bg-transparent border-none cursor-pointer font-mono text-base -mb-px px-[14px] pt-2 pb-[7px]",
        "transition-[color,border-color] outline-none",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        isActive
          ? "border-b-2 border-accent text-accent font-semibold"
          : "border-b-2 border-transparent text-foreground-dim hover:text-foreground",
      )}
      onClick={() => setActive(value)}
      ref={ref}
      role="tab"
    >
      {children}
    </button>
  );
}

export function TabPanel({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const { active } = useTabsContext();
  if (active !== value) return null;
  return (
    <div className="flex-1 overflow-auto" data-testid={`${TabsTestId.Panel}-${value}`} role="tabpanel">
      {children}
    </div>
  );
}
