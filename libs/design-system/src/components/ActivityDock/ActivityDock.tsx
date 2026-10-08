"use client";
import type { ReactNode, Ref } from "react";
import { useId, useRef } from "react";
import { LAYOUT } from "../../tokens";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";

export enum ActivityDockTestId {
  Root = "activity-dock-root",
  Bar = "activity-dock-bar",
  Button = "activity-dock-button",
  Badge = "activity-dock-badge",
  Body = "activity-dock-body",
  Backdrop = "activity-dock-backdrop",
}

export interface ActivityDockItem {
  id: string;
  icon: IconName;
  /** Accessible name + tooltip. */
  label: string;
  /** Rendered only when > 0 (capped at "99+"). */
  badge?: number;
  /** The panel content. */
  body: ReactNode;
}

export interface ActivityDockProps {
  items: ActivityDockItem[];
  /** `null` = collapsed. */
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
  /** Landmark label for the icon bar. */
  ariaLabel?: string;
  ref?: Ref<HTMLDivElement>;
}

/**
 * VS Code-style activity dock: a 50px icon bar whose icons open a panel body.
 * Controlled — persistence is the caller's policy. From `lg` the body sits in
 * flow next to the bar (pushing content); below `lg` it overlays the content
 * behind a click-to-close backdrop.
 */
export function ActivityDock({
  items,
  activeId,
  onActiveChange,
  ariaLabel = "Activity dock",
  ref,
}: ActivityDockProps) {
  const bodyId = useId();
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const active = items.find((i) => i.id === activeId);

  return (
    <div
      className="relative z-40 flex h-full lg:z-auto"
      data-testid={ActivityDockTestId.Root}
      ref={ref}
    >
      {active && (
        <div
          aria-hidden="true"
          className="fixed inset-0 bg-[var(--color-overlay)] lg:hidden"
          data-testid={ActivityDockTestId.Backdrop}
          onClick={() => onActiveChange(null)}
        />
      )}
      <nav
        aria-label={ariaLabel}
        className="relative flex shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2"
        data-testid={ActivityDockTestId.Bar}
        style={{ width: LAYOUT.dockBarWidth }}
      >
        {items.map((item) => {
          const isActive = item.id === activeId;
          const count = item.badge && item.badge > 0 ? item.badge : 0;
          return (
            <button
              aria-controls={isActive ? bodyId : undefined}
              aria-label={count ? `${item.label}, ${count}` : item.label}
              aria-pressed={isActive}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center text-ink-2 hover:text-ink",
                isActive && "bg-panel-2 text-ink",
                focusRingInset,
              )}
              data-testid={ActivityDockTestId.Button}
              key={item.id}
              onClick={() => onActiveChange(isActive ? null : item.id)}
              ref={(el) => {
                buttons.current[item.id] = el;
              }}
              title={item.label}
              type="button"
            >
              <Icon name={item.icon} size="lg" />
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 right-0.5 min-w-4 bg-accent px-1 text-center font-mono text-[10px] leading-4 text-background"
                  data-testid={ActivityDockTestId.Badge}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      {active && (
        <div
          className={cn(
            "z-10 h-full shrink-0 overflow-y-auto border-r border-line bg-panel",
            "absolute top-0 bottom-0 lg:static",
          )}
          data-testid={ActivityDockTestId.Body}
          id={bodyId}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            onActiveChange(null);
            buttons.current[active.id]?.focus();
          }}
          style={{ width: LAYOUT.railWidthLeft, left: LAYOUT.dockBarWidth }}
        >
          {active.body}
        </div>
      )}
    </div>
  );
}
