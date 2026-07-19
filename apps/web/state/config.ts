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
  // carries a nav-rail entry of its own; `/chat` is reached via the sidebar's
  // `BrandLogo`/⌘J, `/archiv` via `ChatTasksPanel`'s own "Archiv" link.
  { id: "projects", glyph: "code", href: "/projects" },
  { id: "companies", glyph: "branch", href: "/companies" },
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
 * are decided inline in the run detail; F8d: the Overview rail this used to
 * also read as is deleted — a run-attached approval is reached via `/chat`'s
 * inline `RunDetail` now.)
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

/**
 * Routes `AppShell` renders fullscreen — bypassing `MainLayout` (no nav rail /
 * top bar / right rail) — instead of as a page nested in the HUD chrome (D2,
 * `docs/hud2chat/DECISIONS.md`). Each HUD → Chat UI migration phase appends its
 * own route here as that section adopts the immersive shell: `/chat` (F0),
 * `/settings` (F1), `/archiv` (F2 — the task archive, reached via
 * `ChatTasksPanel`'s own "Archiv" link, not the classic nav rail), `/skills`,
 * `/commands`, `/mcp`, `/hooks` (F3), `/agents`, `/automations` (F4), `/pipelines`,
 * `/chains` (F5 — both share one `Screen.tsx` for list *and* detail, switching
 * on the `[id]` route segment; `isFullscreenRoute`'s prefix match also covers
 * each section's `/[id]` detail route), `/projects`, `/companies` (F6 — the
 * prefix match also covers `/projects/new`, the nested `/projects/[id]/
 * integrations/[integrationId]` and `/companies/new`), `/memory`, `/gates`
 * (F7 — the last mechanical conversion phase; `/gates` has no `/[id]` detail
 * route, so the prefix match only ever matches the bare path). F10 collapses
 * this table entirely once the HUD branch is deleted.
 */
export const FULLSCREEN_ROUTES = [
  "/chat",
  "/settings",
  "/archiv",
  "/skills",
  "/commands",
  "/mcp",
  "/hooks",
  "/agents",
  "/automations",
  "/pipelines",
  "/chains",
  "/projects",
  "/companies",
  "/memory",
  "/gates",
] as const;

/** Whether `pathname` (or one of its sub-paths) is a fullscreen route. */
export function isFullscreenRoute(pathname: string): boolean {
  return FULLSCREEN_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}
