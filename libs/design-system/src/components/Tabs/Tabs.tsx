"use client";
import type { CSSProperties, HTMLAttributes, ReactNode, Ref } from "react";
import { createContext, useContext, useState } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

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
  className?: string;
}

export function Tabs({ defaultValue = "", value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = value ?? internal;
  const setActive = (id: string) => {
    setInternal(id);
    onValueChange?.(id);
  };
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={className} style={{ display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  const tokens = useTokens();
  return (
    <div
      role="tablist"
      className={className}
      style={{
        display:        "flex",
        gap:            "2px",
        borderBottom:   `1px solid ${tokens.color.border.default}`,
        paddingBottom:  "0",
        flexShrink:     0,
      }}
    >
      {children}
    </div>
  );
}

export interface TabProps extends HTMLAttributes<HTMLButtonElement> {
  value: string;
  ref?: Ref<HTMLButtonElement>;
}

export function Tab({ value, children, style, ref, ...rest }: TabProps) {
  const { active, setActive } = useTabsContext();
  const tokens = useTokens();
  const isActive = active === value;

  const computedStyle: CSSProperties = {
    background:     "none",
    border:         "none",
    borderBottom:   isActive ? `2px solid ${tokens.color.accent.active}` : "2px solid transparent",
    cursor:         "pointer",
    padding:        "8px 14px 7px",
    fontFamily:     tokens.font.mono,
    fontSize:       "0.75rem",
    fontWeight:     isActive ? 600 : 400,
    color:          isActive ? tokens.color.accent.active : tokens.color.text.secondary,
    transition:     "color 0.12s, border-color 0.12s",
    marginBottom:   "-1px",
    ...style,
  };

  return (
    <button
      {...rest}
      ref={ref}
      role="tab"
      aria-selected={isActive}
      onClick={() => setActive(value)}
      style={computedStyle}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const { active } = useTabsContext();
  if (active !== value) return null;
  return (
    <div role="tabpanel" className={className} style={{ flex: 1, overflow: "auto" }}>
      {children}
    </div>
  );
}
