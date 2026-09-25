"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { focusRingInset } from "../../utils/focus";
import { useOverlayStack } from "../../hooks/useOverlayStack";
import { Icon } from "../Icon/Icon";
import { Kbd } from "../Kbd/Kbd";
import { Typography } from "../Typography/Typography";

export enum CommandPaletteTestId {
  Overlay = "command-palette-overlay",
  Root = "command-palette-root",
  Input = "command-palette-input",
  Spinner = "command-palette-spinner",
  List = "command-palette-list",
  Group = "command-palette-group",
  GroupLabel = "command-palette-group-label",
  Item = "command-palette-item",
  Empty = "command-palette-empty",
  Footer = "command-palette-footer",
}

/** A single result row. `id` is unique within its group. */
export interface CommandPaletteItem {
  id: string;
  /** Leading category label (DS App mock: "PAGE" / "AGENT" / "TASK" / "/COMMAND"). */
  kind: string;
  label: string;
  /** Trailing meta (a department code, a shortcut, a timestamp). */
  meta?: string;
  /** Informational only — the consumer's own `onSelect` performs navigation. */
  href?: string;
  /** Fired when the row is activated (click, or Enter while highlighted). */
  onSelect?: () => void;
}

export interface CommandPaletteGroup {
  label: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandPaletteGroup[];
  query: string;
  onQueryChange: (query: string) => void;
  loading?: boolean;
  /** Placeholder text for the search field. */
  placeholder?: string;
  /** Accessible label for the search field. */
  ariaLabel?: string;
  /** Message shown when the query is non-empty but produced no hits. */
  emptyLabel?: string;
}

interface FlatItem {
  groupIndex: number;
  itemIndex: number;
}

/**
 * The centred top overlay (DS App mock's "Command palette", `⌘K`) — grouped
 * results with full keyboard navigation (`↑`/`↓`/`Enter`/`Escape`). The
 * consumer binds the `⌘K` shortcut and controls `open`/`query` (this component
 * owns no state beyond the active row). Reuses {@link SearchMenu}'s keyboard-nav
 * and row-highlight conventions internally, laid out as its own centred, full
 * panel instead of an anchored dropdown.
 */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  query,
  onQueryChange,
  loading = false,
  placeholder = "Jump to a page, department, agent, task or /command",
  ariaLabel = "Command palette",
  emptyLabel = "No results",
}: CommandPaletteProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const { isTopmost } = useOverlayStack(open);

  const flat = useMemo<FlatItem[]>(
    () =>
      groups.flatMap((group, groupIndex) =>
        group.items.map((_, itemIndex) => ({ groupIndex, itemIndex })),
      ),
    [groups],
  );

  const hasQuery = query.trim() !== "";
  const showEmpty = hasQuery && !loading && flat.length === 0;
  const activeRow = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (!isTopmost()) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, isTopmost, onOpenChange]);

  if (!open) return null;

  const select = (flatItem: FlatItem) => {
    const item = groups[flatItem.groupIndex]?.items[flatItem.itemIndex];
    item?.onSelect?.();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      const active = flat[activeRow];
      if (active) {
        e.preventDefault();
        select(active);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-[var(--color-overlay)] pt-[120px]"
      data-testid={CommandPaletteTestId.Overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      role="presentation"
    >
      <div
        aria-modal
        aria-label={ariaLabel}
        className="relative flex h-fit w-[600px] max-w-[calc(100vw-32px)] flex-col border border-ink bg-panel"
        data-testid={CommandPaletteTestId.Root}
        ref={rootRef}
        role="dialog"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <Kbd>⌘K</Kbd>
          <input
            aria-activedescendant={flat[activeRow] ? `${listboxId}-${activeRow}` : undefined}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={flat.length > 0}
            aria-label={ariaLabel}
            autoComplete="off"
            className={cn(
              "h-12 flex-1 min-w-0 bg-transparent text-base text-foreground",
              "placeholder:text-foreground-faint",
              focusRingInset,
            )}
            data-testid={CommandPaletteTestId.Input}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            ref={inputRef}
            role="combobox"
            type="text"
            value={query}
          />
          {loading && (
            <span className="inline-flex animate-spin" data-testid={CommandPaletteTestId.Spinner}>
              <Icon name="retry" size="sm" tone="faint" />
            </span>
          )}
        </div>

        <div
          className="max-h-[420px] overflow-y-auto py-1.5"
          data-testid={CommandPaletteTestId.List}
          id={listboxId}
          role="listbox"
        >
          {showEmpty ? (
            <Typography
              data-testid={CommandPaletteTestId.Empty}
              style={{ padding: "8px 14px" }}
              type="bodySm"
              variant="tertiary"
            >
              {emptyLabel}
            </Typography>
          ) : (
            groups
              .filter((group) => group.items.length > 0)
              .map((group) => (
                <div data-testid={`${CommandPaletteTestId.Group}-${group.label}`} key={group.label}>
                  <Typography
                    data-testid={`${CommandPaletteTestId.GroupLabel}-${group.label}`}
                    style={{ padding: "6px 14px 4px" }}
                    type="labelSm"
                  >
                    {group.label}
                  </Typography>
                  {group.items.map((item) => {
                    const groupIndex = groups.indexOf(group);
                    const itemIndex = group.items.indexOf(item);
                    const index = flat.findIndex(
                      (f) => f.groupIndex === groupIndex && f.itemIndex === itemIndex,
                    );
                    const active = index === activeRow;
                    return (
                      <button
                        aria-selected={active}
                        className={cn(
                          "grid w-full grid-cols-[90px_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 text-left",
                          active ? "bg-hover" : "",
                          focusRingInset,
                        )}
                        data-testid={`${CommandPaletteTestId.Item}-${item.id}`}
                        id={`${listboxId}-${index}`}
                        key={item.id}
                        onClick={() => select({ groupIndex, itemIndex })}
                        onPointerMove={() => setActiveIndex(index)}
                        role="option"
                        type="button"
                      >
                        <Typography truncate type="labelSm">
                          {item.kind}
                        </Typography>
                        <Typography truncate type="bodySm">
                          {item.label}
                        </Typography>
                        <Typography truncate type="labelSm">
                          {item.meta}
                        </Typography>
                      </button>
                    );
                  })}
                </div>
              ))
          )}
        </div>

        <div
          className="flex gap-4 border-t border-line px-3.5 py-2"
          data-testid={CommandPaletteTestId.Footer}
        >
          <Typography type="labelSm">↑↓ Move</Typography>
          <Typography type="labelSm">↵ Open</Typography>
          <Typography type="labelSm">Esc Close</Typography>
        </div>
      </div>
    </div>
  );
}
