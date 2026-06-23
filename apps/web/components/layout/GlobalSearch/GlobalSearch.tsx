"use client";

import { useEffect } from "react";
import { SearchMenu } from "@zibby/design-system";
import { useGlobalSearch } from "./useGlobalSearch";

/**
 * Topbar global search. Aggregates the per-resource `search` endpoints (agents,
 * skills, projects, automations) plus the client-only integrations catalog into
 * one categorized dropdown rendered by the DS {@link SearchMenu}. The query is
 * debounced; each backed category is gated on a non-empty query so an empty bar
 * issues no requests. Choosing a result navigates to that resource's page.
 */
export function GlobalSearch() {
  const {
    value,
    setValue,
    open,
    setOpen,
    sections,
    loading,
    handleSelect,
    inputRef,
    focusSearch,
    placeholder,
    ariaLabel,
    emptyLabel,
  } = useGlobalSearch();

  // Global ⌘K / Ctrl+K focuses the search bar (the hint the bar already shows).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch]);

  return (
    <SearchMenu
      ariaLabel={ariaLabel}
      emptyLabel={emptyLabel}
      inputRef={inputRef}
      loading={loading}
      onOpenChange={setOpen}
      onSelect={handleSelect}
      onValueChange={setValue}
      open={open}
      placeholder={placeholder}
      sections={sections}
      shortcut="⌘K"
      value={value}
    />
  );
}
