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
  { id: "overview", glyph: "grid", href: "/overview" },
  { id: "chat", glyph: "butlerSign", href: "/chat" },
  { id: "runs", glyph: "pulse", href: "/runs" },
  { id: "projects", glyph: "code", href: "/projects" },
  { id: "agents", glyph: "bot", href: "/agents" },
  { id: "pipelines", glyph: "flow", href: "/pipelines" },
  { id: "chains", glyph: "link", href: "/chains" },
  { id: "automations", glyph: "clock", href: "/automations" },
  { id: "skills", glyph: "spark", href: "/skills" },
  { id: "commands", glyph: "bolt", href: "/commands" },
  { id: "hooks", glyph: "checkpoint", href: "/hooks" },
  { id: "mcp", glyph: "server", href: "/mcp" },
  { id: "memory", glyph: "brain", href: "/memory" },
] as const satisfies readonly NavConfig[];

export const SETTINGS_ITEM = {
  id: "settings",
  glyph: "gear",
  href: "/settings",
} as const satisfies NavConfig;

/**
 * Screens that stay routable but carry no sidebar entry: the gate rules live
 * as a Settings sub-section. (Approvals have no screen at all — pending gates
 * are decided inline in the run detail and the Overview rail.)
 */
export const ROUTE_ONLY_ITEMS = [
  { id: "gates", glyph: "checkpoint", href: "/gates" },
] as const satisfies readonly NavConfig[];

/**
 * A navigation segment id — the `id` of any nav item (incl. settings and the
 * route-only screens). These double as keys under the `nav.<id>` message
 * catalog, so typing them as a union lets `t(navId)` be validated at compile
 * time.
 */
export type NavId =
  | (typeof NAV_ITEMS)[number]["id"]
  | (typeof ROUTE_ONLY_ITEMS)[number]["id"]
  | (typeof SETTINGS_ITEM)["id"];

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
