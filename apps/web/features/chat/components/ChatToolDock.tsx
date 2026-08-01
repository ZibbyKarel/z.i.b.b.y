"use client";

import { Divider, GlassSurface, Icon, Stack } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { NAV_ITEMS, SETTINGS_ITEM } from "../../../state/config";

export enum ChatToolDockTestId {
  Root = "chat-tool-dock",
  Settings = "chat-tool-dock-settings",
}

/** px the map's right inset must clear (Task 6 consumes this to size the reserved gutter).
 *  38px hit target + the design strip's 7px side padding + its 1px glass border. */
export const CHAT_TOOL_DOCK_WIDTH = 54;

/** Design `velin-d-dock.jsx`'s `VcDock` pill: `flexDirection: column, gap: 6, padding:
 *  '10px 7px', borderRadius: 22` — laid directly on the glass surface itself (its
 *  children are the tool buttons, no intervening flex wrapper). */
const DOCK_STRIP_STYLE = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  borderRadius: "22px",
  padding: "10px 7px",
} as const;

// The design's tool set, in order — a subset of the HUD nav (source of truth).
// `hooks` joined in F3 (docs/plans/hud2chat-F3-catalogs-a.md): it was one of the
// two fully orphaned sections (no dock icon, no drawer mention) even though it
// already had a NAV_ITEMS entry with a `checkpoint` glyph. `automations` joined
// in F4 (docs/plans/hud2chat-F4-catalogs-b.md) — the audit's other fully
// orphaned section, already in NAV_ITEMS with a `clock` glyph. `pipelines`
// joined in F5 (docs/plans/hud2chat-F5-orchestration.md): it was missing from
// Chat entirely per the audit (only reachable via the subsystem drawer's
// Roster tab).
// `signals` joined with the B3a handoff signal-kind registry (design doc
// `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`)
// — same posture as `hooks`/`automations` above: a config-ish catalog with its
// own NAV_ITEMS entry that needs a dock icon to actually be reachable.
const DOCK_IDS = [
  "companies",
  "projects",
  "agents",
  "pipelines",
  "skills",
  "commands",
  "mcp",
  "hooks",
  "signals",
  "automations",
  "memory",
] as const;

// 38×38 hit target (spec §5.3) with the design's 12px button rounding, dim by
// default, accent on hover/focus. Design `VdDockBtn`: `display: grid, placeItems:
// center` (not flex) — a real layout-mode value the structural skeleton match
// checks, not a cosmetic choice.
const DOCK_LINK_CLASS =
  "grid size-[38px] place-items-center rounded-[12px] text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent";

/**
 * Right-side glass tool dock — icon links into the HUD pages (Velin-D design).
 * Position-agnostic: the mounting `Container` (Task 6) places it at
 * right:24, vertical-center. This component owns only its own contents.
 *
 * Structure mirrors the design's `VcDockGroup > VcDock > (pill)` nesting
 * (`velin-d-dock.jsx`): an outer `flex-column, align:flex-end` landmark (this
 * doubles as the semantic `<nav>`, so it also carries the Root testid — the
 * design has no separate nav wrapper to mirror), a `flex-row, align:center,
 * gap:10` inner row (in the design this also hosts the hover-preview panel as
 * a sibling of the pill; not built here), then the glass pill itself with the
 * tool buttons as its direct children.
 */
export function ChatToolDock() {
  const t = useTranslations("nav");
  const tChat = useTranslations("chat");
  const items = DOCK_IDS.map((id) => NAV_ITEMS.find((n) => n.id === id)).filter(
    (n): n is (typeof NAV_ITEMS)[number] => n != null,
  );

  return (
    <Stack
      align="end"
      aria-label={tChat("toolDock.label")}
      as="nav"
      data-testid={ChatToolDockTestId.Root}
      direction="col"
    >
      <Stack align="center" direction="row" gap="125">
        <GlassSurface radius="panel" style={DOCK_STRIP_STYLE}>
          {/* Design `VdDockBtn` uses the browser's native `title` for its hover
              hint (no custom tooltip bubble) — matched here rather than the DS
              `Tooltip`, whose wrapping span is a real (non-collapsing) structural
              node the design's flat `button` list does not have. */}
          {items.map((item) => (
            <Link
              aria-label={t(item.id)}
              className={DOCK_LINK_CLASS}
              data-testid={`chat-tool-dock-${item.id}`}
              href={item.href}
              key={item.id}
              title={t(item.id)}
            >
              <Icon name={item.glyph} />
            </Link>
          ))}
          <Divider />
          <Link
            aria-label={t(SETTINGS_ITEM.id)}
            className={DOCK_LINK_CLASS}
            data-testid={ChatToolDockTestId.Settings}
            href={SETTINGS_ITEM.href}
            title={t(SETTINGS_ITEM.id)}
          >
            <Icon name={SETTINGS_ITEM.glyph} />
          </Link>
        </GlassSurface>
      </Stack>
    </Stack>
  );
}
