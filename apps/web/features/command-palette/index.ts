// Public surface of the command-palette feature. Other features/AppShell import
// from here, not from hooks/*, components/* or the feature-root modules directly.
export { CommandPaletteHost, type CommandPaletteHostProps } from "./components/CommandPaletteHost";
export { useCommandPaletteHotkey } from "./hooks/useCommandPaletteHotkey";
export { buildCommandPaletteIndex, type CommandPaletteSources } from "./buildIndex";
export { groupAndFilterEntries, matchesQuery, GROUP_ORDER, GROUP_CAP } from "./filterEntries";
export { SETTINGS_SECTIONS, GATE_SECTIONS } from "./staticSections";
export type {
  CommandPaletteEntry,
  CommandPaletteEntryKind,
  CommandPaletteGroupKey,
  CommandPaletteLabels,
  CommandPaletteActionId,
} from "./types";
