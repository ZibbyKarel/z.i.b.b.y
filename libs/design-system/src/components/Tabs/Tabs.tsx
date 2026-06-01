"use client";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { createContext, useContext, useState } from "react";
import { cn } from "../../utils/cn";

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
      <div className="flex flex-col">{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  return (
    <div
      role="tablist"
      className="flex gap-0.5 border-b border-border shrink-0"
    >
      {children}
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
      {...rest}
      ref={ref}
      role="tab"
      aria-selected={isActive}
      onClick={() => setActive(value)}
      className={cn(
        "bg-transparent border-none cursor-pointer font-mono text-base -mb-px px-[14px] pt-2 pb-[7px]",
        "transition-[color,border-color] outline-none",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        isActive
          ? "border-b-2 border-accent text-accent font-semibold"
          : "border-b-2 border-transparent text-foreground-dim hover:text-foreground",
      )}
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
    <div role="tabpanel" className="flex-1 overflow-auto">
      {children}
    </div>
  );
}
