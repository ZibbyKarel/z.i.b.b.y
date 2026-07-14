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
const DOCK_IDS = ["companies", "projects", "agents", "skills", "commands", "mcp", "memory"] as const;

/**
 * Right-side glass tool dock — icon links into the HUD pages (Velin-D design).
 * Position-agnostic: the mounting `Container` (Task 6) places it at
 * right:24, vertical-center. This component owns only its own contents.
 */
export function ChatToolDock() {
  const t = useTranslations("nav");
  // `chat.toolDock.label` lands with Task 7's catalog edit (this task may not touch
  // cs.json/en.json). The typed `t()` overload only accepts keys that exist in the
  // catalog today, so this call is cast through a loosened signature — next-intl's
  // runtime falls back to the key path for a missing message rather than throwing
  // (verified by this file's own test), so the aria-label degrades gracefully until
  // Task 7 lands the key.
  const tChat = useTranslations("chat") as (key: string) => string;
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
              <Link aria-label={t(item.id)} data-testid={`chat-tool-dock-${item.id}`} href={item.href}>
                <Icon name={item.glyph} />
              </Link>
            </Tooltip>
          ))}
          <Divider />
          <Tooltip content={t(SETTINGS_ITEM.id)}>
            <Link
              aria-label={t(SETTINGS_ITEM.id)}
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
