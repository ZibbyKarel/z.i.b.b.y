"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CommandPaletteLoaded } from "./CommandPaletteLoaded";

export interface CommandPaletteHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the shared `?approval=` sheet for a high-risk "Approve next" pick. */
  onOpenApproval: (id: string) => void;
}

/**
 * The `⌘K` overlay itself (ROUTE-MAP §1) — controlled by the caller (`AppShell`
 * owns `open`, bound to both the global hotkey and `AppHeader`'s `onSearchClick`
 * via {@link useCommandPaletteHotkey}). The actual index (every domain hook) only
 * mounts — `CommandPaletteLoaded` — while `open` is true, so nothing fetches
 * while the palette is closed. Sits next to `<ApprovalSheet>` in `AppShellChrome`.
 */
export function CommandPaletteHost({
  open,
  onOpenChange,
  onOpenApproval,
}: CommandPaletteHostProps) {
  const t = useTranslations("commandPalette");
  const [query, setQuery] = useState("");

  if (!open) return null;

  return (
    <CommandPaletteLoaded
      ariaLabel={t("ariaLabel")}
      emptyLabel={t("empty")}
      onOpenApproval={onOpenApproval}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      onQueryChange={setQuery}
      placeholder={t("placeholder")}
      query={query}
    />
  );
}
