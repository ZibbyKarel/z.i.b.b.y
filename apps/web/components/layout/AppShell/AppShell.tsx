"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Container, type NavItem } from "@zibby/design-system";
import { MainLayout } from "../MainLayout/MainLayout";
import { LimitsRings } from "../LimitsRings/LimitsRings";
import { RightRail } from "../RightRail/RightRail";
import {
  NAV_ITEMS,
  type NavId,
  ROUTE_ONLY_ITEMS,
  SETTINGS_ITEM,
  isFullscreenRoute,
} from "../../../state/config";
import { CatalogProvider } from "../../../state/store";
import { NewTaskButton, NewTaskProvider } from "../../../features/tasks";
import { ChatButton, ChatProvider } from "../../../features/chat";

const NAV_IDS = new Set<NavId>([
  ...NAV_ITEMS.map((n) => n.id),
  ...ROUTE_ONLY_ITEMS.map((n) => n.id),
  SETTINGS_ITEM.id,
]);

function pathnameToNavId(pathname: string): NavId {
  const segment = pathname.split("/").filter(Boolean)[0];
  // F8d: "overview" no longer exists as a NavId (`/overview` is deleted, O2/O3).
  // This classic-HUD branch is already unreachable via normal navigation — every
  // surviving `NAV_ITEMS` route is `FULLSCREEN_ROUTES`-immersive as of this phase
  // (F10 formally deletes the branch) — so "projects" is an arbitrary but never-
  // actually-hit fallback, kept only so the return type stays a valid `NavId`.
  return segment !== undefined && NAV_IDS.has(segment as NavId) ? (segment as NavId) : "projects";
}

function AppShellInner({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  // Phase 27 / F0 (D2, docs/hud2chat/DECISIONS.md): fullscreen routes are a
  // coequal, parallel UI to the HUD — not a screen nested inside it. Bypass
  // MainLayout entirely (no nav rail / top bar / right rail) and render the
  // route's own chrome fullscreen, while staying inside AppShell's provider
  // stack (e.g. ChatProvider survives leaving/returning to `/chat`). `/chat` is
  // the only member of the table today; later migration phases append their
  // own routes as they adopt the immersive shell.
  if (isFullscreenRoute(pathname)) {
    return (
      <Container height="100dvh" overflow="hidden" width="100%">
        {children}
      </Container>
    );
  }

  const activeNav = pathnameToNavId(pathname);

  const navItems: NavItem[] = NAV_ITEMS.map((item) => ({
    ...item,
    label: t(item.id),
  }));

  const footerItem: NavItem = {
    ...SETTINGS_ITEM,
    label: t(SETTINGS_ITEM.id),
  };

  const breadcrumb = t(activeNav);

  return (
    <MainLayout
      activeNav={activeNav}
      breadcrumb={breadcrumb}
      chatSlot={<ChatButton />}
      footerItem={footerItem}
      navItems={navItems}
      railSlot={<RightRail />}
      taskSlot={<NewTaskButton />}
      walletSlot={<LimitsRings />}
    >
      {children}
    </MainLayout>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      {/* NewTaskProvider stays the OUTER provider (the position the removed
          VoiceProvider held), so the chat overlay can reach the task flow later.
          Phase 108: the Fáze-11/Phase-24 app-wide "active project" scope is
          gone — ZIBBY always shows every project's data at once, so there is
          no dashboard-level scope left to mount here. */}
      <NewTaskProvider>
        <ChatProvider>
          <Suspense>
            <AppShellInner>{children}</AppShellInner>
          </Suspense>
        </ChatProvider>
      </NewTaskProvider>
    </CatalogProvider>
  );
}
