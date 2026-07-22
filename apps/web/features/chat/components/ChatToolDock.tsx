"use client";

import { Divider, GlassSurface, Icon, Stack, Tooltip } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { NAV_ITEMS, SETTINGS_ITEM } from "../../../state/config";

export enum ChatToolDockTestId {
  Root = "chat-tool-dock",
  Nav = "chat-tool-dock-nav",
  Settings = "chat-tool-dock-settings",
}

/** px the map's right inset must clear (Task 6 consumes this to size the reserved gutter). */
export const CHAT_TOOL_DOCK_WIDTH = 70;

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

// 38×38 hit target (spec §5.3), dim by default, accent on hover/focus.
const DOCK_LINK_CLASS =
  "flex size-[38px] items-center justify-center rounded-[6px] text-foreground-dim outline-none transition-colors hover:text-accent focus-visible:text-accent";

/**
 * Right-side glass tool dock — icon links into the HUD pages (Velin-D design).
 * Position-agnostic: the mounting `Container` (Task 6) places it at
 * right:24, vertical-center. This component owns only its own contents.
 */
export function ChatToolDock() {
  const t = useTranslations("nav");
  const tChat = useTranslations("chat");
  const items = DOCK_IDS.map((id) => NAV_ITEMS.find((n) => n.id === id)).filter(
    (n): n is (typeof NAV_ITEMS)[number] => n != null,
  );

  return (
    <GlassSurface data-testid={ChatToolDockTestId.Root} radius="panel">
      {/* Semantic landmark; bare element, no styles. Consumes chat.toolDock.label. */}
      <nav aria-label={tChat("toolDock.label")} data-testid={ChatToolDockTestId.Nav}>
        <Stack align="center" direction="col" gap="75">
          {items.map((item) => (
            <Tooltip content={t(item.id)} key={item.id}>
              <Link
                aria-label={t(item.id)}
                className={DOCK_LINK_CLASS}
                data-testid={`chat-tool-dock-${item.id}`}
                href={item.href}
              >
                <Icon name={item.glyph} />
              </Link>
            </Tooltip>
          ))}
          <Divider />
          <Tooltip content={t(SETTINGS_ITEM.id)}>
            <Link
              aria-label={t(SETTINGS_ITEM.id)}
              className={DOCK_LINK_CLASS}
              data-testid={ChatToolDockTestId.Settings}
              href={SETTINGS_ITEM.href}
            >
              <Icon name={SETTINGS_ITEM.glyph} />
            </Link>
          </Tooltip>
        </Stack>
      </nav>
    </GlassSurface>
  );
}
