"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { type StateTone } from "../../stateTone";
import { AgentGlyph } from "../AgentGlyph/AgentGlyph";
import { StateDot } from "../StatePill/StatePill";
import { ZibbyAvatar } from "../ZibbyAvatar/ZibbyAvatar";
import { type FloorplanHover, OrgFloorplanTestId } from "./types";

export const POPOVER_WIDTH = 300;
const VIEWPORT_MARGIN = 8;

export interface FloorplanPopoverProps {
  hover: FloorplanHover;
  stateLabels: Record<StateTone, string>;
  workingOn: string;
}

/**
 * Hover/focus card for an agent or the COO — fixed, 300px, never takes the pointer.
 * Renders only what the data provides: head, state, and the current task.
 */
export function FloorplanPopover({ hover, stateLabels, workingOn }: FloorplanPopoverProps) {
  const { subject } = hover;
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(hover.y);
  // Clamp to the viewport using the card's real height (it varies with the task text).
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(VIEWPORT_MARGIN, Math.min(hover.y, window.innerHeight - h - VIEWPORT_MARGIN)));
  }, [hover]);
  return (
    <div
      className="pointer-events-none fixed z-50 box-border w-[300px] border border-ink bg-panel text-ink"
      data-testid={OrgFloorplanTestId.Popover}
      ref={ref}
      style={{ left: hover.x, top }}
    >
      <div className="flex items-center gap-[12px] border-b border-line px-[14px] py-[12px]">
        {subject.coo ? (
          <ZibbyAvatar size={38} state={subject.state} />
        ) : (
          <AgentGlyph glow={false} seed={subject.seed} size={38} state={subject.state} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span
            className="truncate font-mono text-[12px] font-semibold uppercase tracking-[0.12em]"
            data-testid={OrgFloorplanTestId.PopoverName}
          >
            {subject.name}
          </span>
          <span
            className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3"
            data-testid={OrgFloorplanTestId.PopoverMeta}
          >
            {subject.meta}
          </span>
        </div>
      </div>
      <div
        className="flex items-center gap-[8px] bg-panel-2 px-[14px] py-[9px] font-mono text-[11px] uppercase tracking-[0.12em]"
        data-testid={OrgFloorplanTestId.PopoverState}
      >
        <StateDot px={8} state={subject.state} />
        <span>{stateLabels[subject.state]}</span>
      </div>
      {subject.task && (
        <div className="flex flex-col gap-[7px] border-t border-line px-[14px] py-[12px]">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            01 — {workingOn}
          </span>
          <span
            className="text-[14px] leading-[1.35] [text-wrap:pretty]"
            data-testid={OrgFloorplanTestId.PopoverTask}
          >
            {subject.task}
          </span>
        </div>
      )}
    </div>
  );
}
