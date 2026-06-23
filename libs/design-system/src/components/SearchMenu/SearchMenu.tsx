"use client";

import { type Ref, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../utils/cn";
import { mergeRefs } from "../../utils/refs";
import { Icon, type IconName } from "../Icon/Icon";
import { Kbd } from "../Kbd/Kbd";
import { MenuSurface } from "../MenuSurface/MenuSurface";

export enum SearchMenuTestId {
  Root = "searchmenu-root",
  Input = "searchmenu-input",
  Icon = "searchmenu-icon",
  Shortcut = "searchmenu-shortcut",
  Spinner = "searchmenu-spinner",
  Panel = "searchmenu-panel",
  Section = "searchmenu-section",
  SectionLabel = "searchmenu-section-label",
  Item = "searchmenu-item",
  Empty = "searchmenu-empty",
}

/** A single hit inside a category. `id` is unique within its section. */
export interface SearchMenuItem {
  id: string;
  title: string;
  subtitle?: string;
  glyph?: IconName;
}

/** A labelled group of hits (e.g. "Agents", "Skills"). `id` is unique per menu. */
export interface SearchMenuSection {
  id: string;
  label: string;
  items: SearchMenuItem[];
}

export interface SearchMenuProps {
  /** Current query text (controlled). */
  value: string;
  onValueChange: (value: string) => void;
  /** Grouped results to render in the dropdown. Empty sections are skipped. */
  sections: SearchMenuSection[];
  /** Whether the dropdown is open (controlled). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired when a result is chosen (click or Enter on the active row). */
  onSelect: (sectionId: string, itemId: string) => void;
  placeholder: string;
  /** Accessible label for the search input. */
  ariaLabel: string;
  /** Optional keyboard-shortcut hint shown on the trailing edge when idle. */
  shortcut?: string;
  /** Shows a spinner and a "searching" affordance while results are in flight. */
  loading?: boolean;
  /** Message shown when the query is non-empty but produced no hits. */
  emptyLabel?: string;
  /** Forwarded ref to the underlying input — e.g. to focus it from a ⌘K handler. */
  inputRef?: Ref<HTMLInputElement>;
}

interface FlatItem {
  sectionId: string;
  itemId: string;
}

/**
 * A generic search field with a categorized results dropdown. Domain-agnostic:
 * the caller supplies `sections` of `{ id, title, subtitle, glyph }` items and
 * handles `onSelect`. Keyboard: ↑/↓ move the active row across all sections,
 * Enter selects it, Escape closes and restores focus. The panel opens on focus
 * and closes on outside click. Styling mirrors {@link SearchBar}.
 */
export function SearchMenu({
  value,
  onValueChange,
  sections,
  open,
  onOpenChange,
  onSelect,
  placeholder,
  ariaLabel,
  shortcut,
  loading = false,
  emptyLabel,
  inputRef,
}: SearchMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleSections = useMemo(() => sections.filter((s) => s.items.length > 0), [sections]);

  const flat = useMemo<FlatItem[]>(
    () => visibleSections.flatMap((s) => s.items.map((i) => ({ sectionId: s.id, itemId: i.id }))),
    [visibleSections],
  );

  const hasQuery = value.trim() !== "";
  const showEmpty = hasQuery && !loading && flat.length === 0 && emptyLabel !== undefined;
  const panelOpen = open && hasQuery && (flat.length > 0 || loading || showEmpty);

  // Clamp at read time so a result list that shrank between renders never leaves
  // the highlight out of range (no state-syncing effect needed).
  const activeRow = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1);

  // Close on outside pointerdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      onOpenChange(false);
      internalInputRef.current?.blur();
      return;
    }
    if (!panelOpen || flat.length === 0) return;
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
        onSelect(active.sectionId, active.itemId);
      }
    }
  };

  return (
    <div className="relative w-full" data-testid={SearchMenuTestId.Root} ref={rootRef}>
      <div
        className={cn(
          "flex items-center gap-2.5 w-full px-3.5 py-2",
          "bg-background border rounded-sm",
          "transition-colors",
          panelOpen ? "border-border-strong text-foreground" : "border-border text-foreground-dim",
          "focus-within:border-border-strong focus-within:ring-2 focus-within:ring-accent",
        )}
      >
        <Icon data-testid={SearchMenuTestId.Icon} name="search" size="sm" tone="faint" />
        <input
          aria-activedescendant={
            panelOpen && flat[activeRow]
              ? `${listboxId}-${flat[activeRow].sectionId}-${flat[activeRow].itemId}`
              : undefined
          }
          aria-autocomplete="list"
          aria-controls={panelOpen ? listboxId : undefined}
          aria-expanded={panelOpen}
          aria-label={ariaLabel}
          autoComplete="off"
          className={cn(
            "flex-1 min-w-0 bg-transparent text-base text-foreground",
            "placeholder:text-foreground-faint outline-none",
          )}
          data-testid={SearchMenuTestId.Input}
          onChange={(e) => {
            onValueChange(e.target.value);
            onOpenChange(true);
            setActiveIndex(0);
          }}
          onFocus={() => onOpenChange(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={mergeRefs(internalInputRef, inputRef)}
          role="combobox"
          type="text"
          value={value}
        />
        {loading ? (
          <Icon
            className="animate-spin"
            data-testid={SearchMenuTestId.Spinner}
            name="retry"
            size="sm"
            tone="faint"
          />
        ) : shortcut && !hasQuery ? (
          <Kbd data-testid={SearchMenuTestId.Shortcut}>{shortcut}</Kbd>
        ) : null}
      </div>

      {panelOpen ? (
        <MenuSurface
          scroll
          align="stretch"
          data-testid={SearchMenuTestId.Panel}
          id={listboxId}
          role="listbox"
        >
          <div className="py-1.5">
            {showEmpty ? (
              <p
                className="px-3.5 py-2 text-base text-foreground-faint"
                data-testid={SearchMenuTestId.Empty}
              >
                {emptyLabel}
              </p>
            ) : (
              visibleSections.map((section) => (
                <div data-testid={`${SearchMenuTestId.Section}-${section.id}`} key={section.id}>
                  <p
                    className={cn(
                      "px-3.5 pt-1.5 pb-1",
                      "text-xs font-medium uppercase tracking-wide text-foreground-faint",
                    )}
                    data-testid={`${SearchMenuTestId.SectionLabel}-${section.id}`}
                  >
                    {section.label}
                  </p>
                  {section.items.map((item) => {
                    const index = flat.findIndex(
                      (f) => f.sectionId === section.id && f.itemId === item.id,
                    );
                    const active = index === activeRow;
                    return (
                      <button
                        aria-selected={active}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-3.5 py-1.5 text-left",
                          "transition-colors outline-none",
                          active ? "bg-raised text-foreground" : "text-foreground-dim",
                          "hover:bg-raised hover:text-foreground",
                        )}
                        data-testid={`${SearchMenuTestId.Item}-${section.id}-${item.id}`}
                        id={`${listboxId}-${section.id}-${item.id}`}
                        key={item.id}
                        onClick={() => onSelect(section.id, item.id)}
                        onPointerMove={() => setActiveIndex(index)}
                        role="option"
                        type="button"
                      >
                        {item.glyph ? (
                          <Icon name={item.glyph} size="sm" tone={active ? "accent" : "faint"} />
                        ) : null}
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-base">{item.title}</span>
                          {item.subtitle ? (
                            <span className="block truncate text-xs text-foreground-faint">
                              {item.subtitle}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </MenuSurface>
      ) : null}
    </div>
  );
}
