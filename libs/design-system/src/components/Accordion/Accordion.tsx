"use client";
import type { ReactNode, Ref } from "react";
import { createContext, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";

interface AccordionContextValue {
  single: boolean;
  openId: string | null;
  toggle: (id: string) => void;
  claimDefault: (id: string) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

export enum AccordionTestId {
  Root = "accordion-root",
  Summary = "accordion-summary",
  Chevron = "accordion-chevron",
  Details = "accordion-details",
}

export interface AccordionProps {
  children: ReactNode;
  single?: boolean;
  className?: string;
}

export function Accordion({ children, single = false, className }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const claimed = useRef(false);

  const toggle = (id: string) => setOpenId((prev) => (prev === id ? null : id));

  const claimDefault = (id: string) => {
    if (!claimed.current) {
      claimed.current = true;
      setOpenId(id);
    }
  };

  return (
    <AccordionContext.Provider value={{ single, openId, toggle, claimDefault }}>
      <div
        className={cn("border border-border rounded overflow-hidden", className)}
        data-testid={AccordionTestId.Root}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
}

export interface AccordionSummaryProps {
  children: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  ref?: Ref<HTMLButtonElement>;
}

export function AccordionSummary({
  children,
  expanded = false,
  onToggle,
  ref,
}: AccordionSummaryProps) {
  return (
    <button
      aria-expanded={expanded}
      className={cn(
        "flex w-full items-center justify-between px-3.5 py-2.5",
        "bg-transparent border-none cursor-pointer font-mono font-medium text-base text-foreground text-left",
        focusRingInset,
        expanded && "border-b border-border",
      )}
      data-testid={AccordionTestId.Summary}
      onClick={onToggle}
      ref={ref}
    >
      <span>{children}</span>
      <span
        className="text-sm transition-transform duration-200"
        data-testid={AccordionTestId.Chevron}
        style={{ transform: expanded ? "rotate(180deg)" : "none" }}
      >
        ▾
      </span>
    </button>
  );
}

export interface AccordionDetailsProps {
  children: ReactNode;
  expanded?: boolean;
  className?: string;
}

export function AccordionDetails({ children, expanded = false, className }: AccordionDetailsProps) {
  if (!expanded) return null;
  return (
    <div className={cn("px-3.5 py-3", className)} data-testid={AccordionTestId.Details}>
      {children}
    </div>
  );
}

export interface AccordionItemProps {
  summary: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function AccordionItem({ summary, children, defaultExpanded = false }: AccordionItemProps) {
  const id = useId();
  const ctx = useContext(AccordionContext);
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);

  useLayoutEffect(() => {
    if (ctx?.single && defaultExpanded) {
      ctx.claimDefault(id);
    }
    // intentionally runs only on mount; claimDefault is idempotent via a ref guard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expanded = ctx?.single ? ctx.openId === id : localExpanded;
  const onToggle = ctx?.single ? () => ctx.toggle(id) : () => setLocalExpanded((v) => !v);

  return (
    <>
      <AccordionSummary expanded={expanded} onToggle={onToggle}>
        {summary}
      </AccordionSummary>
      <AccordionDetails expanded={expanded}>{children}</AccordionDetails>
    </>
  );
}
