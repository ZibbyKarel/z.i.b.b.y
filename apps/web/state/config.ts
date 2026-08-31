/**
 * Static dashboard configuration — navigation, option lists and icon/tool
 * picker inventories. No domain content or default values live here: skills,
 * integrations, agents and pipelines all start empty and are created by the
 * user (see store.tsx). Files are the source of truth.
 */
import type { IconName, SelectOption } from "@zibby/design-system";
import type { Route } from "next";

/**
 * Navigation entry without a display label — the label is resolved from the
 * `nav.<id>` message catalog at render time (see AppShell), so no UI text lives
 * in this data module.
 */
export interface NavConfig {
  id: string;
  glyph: IconName;
  /** A statically-typed app route (Next `typedRoutes`) — a typo fails `tsc`. */
  href: Route;
}

export const NAV_ITEMS = [
  // F8d: "overview" (`/overview`) and "runs" (`/runs`) are deleted — `/chat` is
  // home now (O2/O3) and `/archiv` (F2) is the surviving task archive. Neither
  // carries a nav-rail entry of its own; `/chat` is reached via ⌘J from
  // anywhere, `/archiv` via `ChatTasksPanel`'s own "Archiv" link.
  { id: "projects", glyph: "code", href: "/projects" },
  { id: "companies", glyph: "branch", href: "/companies" },
  { id: "teams", glyph: "grid", href: "/teams" },
  { id: "agents", glyph: "bot", href: "/agents" },
  { id: "pipelines", glyph: "flow", href: "/pipelines" },
  { id: "automations", glyph: "clock", href: "/automations" },
  { id: "skills", glyph: "spark", href: "/skills" },
  { id: "commands", glyph: "bolt", href: "/commands" },
  { id: "hooks", glyph: "checkpoint", href: "/hooks" },
  // B3a (docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md):
  // the handoff signal-kind registry — a config-ish catalog, placed with hooks/mcp.
  { id: "signals", glyph: "pulse", href: "/signals" },
  { id: "mcp", glyph: "server", href: "/mcp" },
  { id: "memory", glyph: "brain", href: "/memory" },
] as const satisfies readonly NavConfig[];

export const SETTINGS_ITEM = {
  id: "settings",
  glyph: "gear",
  href: "/settings",
} as const satisfies NavConfig;

export const MODEL_OPTIONS: SelectOption[] = [
  { value: "opus", label: "opus" },
  { value: "sonnet", label: "sonnet" },
  { value: "haiku", label: "haiku" },
];

export const THINKING_OPTIONS: SelectOption[] = [
  { value: "high", label: "high" },
  { value: "medium", label: "medium" },
  { value: "low", label: "low" },
];

/**
 * Agent catalog categories are now a dynamic, user-managed taxonomy served by
 * `GET /api/agents/categories` (see `features/agents/queries.ts`) — names and
 * glyphs live there, not in this static config. The shipped defaults are seeded
 * by the backend on first run.
 */

/** Glyphs offered in the category and agent editor icon pickers. */
export const AGENT_GLYPHS: IconName[] = [
  "compass",
  "code",
  "flask",
  "doc",
  "check",
  "search",
  "bot",
  "brain",
  "shield",
  "spark",
  "film",
  "cart",
  "server",
  "flow",
  "gear",
];

/** Tools an agent can be granted in the editor. */
export const AGENT_TOOLS = ["read", "write", "bash", "git", "web"] as const;
