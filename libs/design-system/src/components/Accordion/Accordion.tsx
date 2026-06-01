"use client";
import type { ReactNode, Ref } from "react";
import { useState } from "react";
import { useTokens } from "../../DesignSystemContext/hooks";

export interface AccordionProps {
  children: ReactNode;
  className?: string;
}

export function Accordion({ children, className }: AccordionProps) {
  const tokens = useTokens();
  return (
    <div
      className={className}
      style={{
        borderWidth:  "1px",
        borderStyle:  "solid",
        borderColor:  tokens.color.border.default,
        borderRadius: tokens.size.radius,
        overflow:     "hidden",
      }}
    >
      {children}
    </div>
  );
}

export interface AccordionSummaryProps {
  children: ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function AccordionSummary({ children, expanded = false, onToggle, className, ref }: AccordionSummaryProps) {
  const tokens = useTokens();
  return (
    <button
      ref={ref}
      className={className}
      aria-expanded={expanded}
      onClick={onToggle}
      style={{
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        width:           "100%",
        padding:         "10px 14px",
        background:      "none",
        border:          "none",
        borderBottom:    expanded ? `1px solid ${tokens.color.border.default}` : "none",
        cursor:          "pointer",
        fontFamily:      tokens.font.mono,
        fontWeight:      500,
        fontSize:        "0.75rem",
        color:           tokens.color.text.primary,
        textAlign:       "left",
      }}
    >
      <span>{children}</span>
      <span style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontSize: "0.625rem" }}>
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
    <div className={className} style={{ padding: "12px 14px" }}>
      {children}
    </div>
  );
}

// Convenience single-item accordion that manages own state
export interface AccordionItemProps {
  summary: ReactNode;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function AccordionItem({ summary, children, defaultExpanded = false }: AccordionItemProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <>
      <AccordionSummary expanded={expanded} onToggle={() => setExpanded((v) => !v)}>
        {summary}
      </AccordionSummary>
      <AccordionDetails expanded={expanded}>{children}</AccordionDetails>
    </>
  );
}
