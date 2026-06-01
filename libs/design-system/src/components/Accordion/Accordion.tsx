"use client";
import { memo, useCallback, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface AccordionSection {
  title: ReactNode;
  content: ReactNode;
  defaultExpanded?: boolean;
}

export interface AccordionProps {
  sections: AccordionSection[];
  single?: boolean;
}

const Summary = memo(function Summary({
  children,
  expanded,
  index,
  onToggle,
}: {
  children: ReactNode;
  expanded: boolean;
  index: number;
  onToggle: (i: number) => void;
}) {
  return (
    <button
      aria-expanded={expanded}
      onClick={() => onToggle(index)}
      className={cn(
        "flex w-full items-center justify-between px-[14px] py-[10px]",
        "bg-transparent border-none cursor-pointer font-mono font-medium text-base text-foreground text-left",
        "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
        expanded && "border-b border-border",
      )}
    >
      <span>{children}</span>
      <span
        className="text-sm transition-transform duration-200"
        style={{ transform: expanded ? "rotate(180deg)" : "none" }}
      >
        ▾
      </span>
    </button>
  );
});

const Details = memo(function Details({
  children,
  expanded,
}: {
  children: ReactNode;
  expanded: boolean;
}) {
  if (!expanded) return null;
  return <div className="px-[14px] py-3">{children}</div>;
});

export function Accordion({ sections, single = false }: AccordionProps) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const init = new Set<number>();
    sections.forEach((s, i) => {
      if (s.defaultExpanded) init.add(i);
    });
    return init;
  });

  const toggle = useCallback(
    (i: number) => {
      if (single) {
        setExpanded((prev) => (prev.has(i) ? new Set() : new Set([i])));
      } else {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.has(i) ? next.delete(i) : next.add(i);
          return next;
        });
      }
    },
    [single],
  );

  return (
    <div className="border border-border rounded overflow-hidden">
      {sections.map((section, i) => {
        const isExpanded = expanded.has(i);
        const isLast = i === sections.length - 1;
        return (
          <div key={i} className={cn(!isLast && "border-b border-border")}>
            <Summary expanded={isExpanded} index={i} onToggle={toggle}>
              {section.title}
            </Summary>
            <Details expanded={isExpanded}>{section.content}</Details>
          </div>
        );
      })}
    </div>
  );
}
