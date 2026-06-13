"use client";

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
    placeholder,
    ariaLabel,
    emptyLabel,
  } = useGlobalSearch();

  return (
    <SearchMenu
      ariaLabel={ariaLabel}
      emptyLabel={emptyLabel}
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
