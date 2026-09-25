import { useEffect } from "react";

/**
 * Binds the global `⌘K` / `Ctrl+K` shortcut to toggle the command palette — the
 * AppShell-level entry point ROUTE-MAP §1 calls out ("⌘K: CommandPalette"). Also
 * backs `AppHeader`'s `onSearchClick` (passed the same `onToggle`), so the header
 * button and the shortcut open the identical instance.
 */
export function useCommandPaletteHotkey(onToggle: () => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      onToggle();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onToggle]);
}
