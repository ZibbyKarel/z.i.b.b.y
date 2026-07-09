"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Container, type NavItem } from "@zibby/design-system";
import { MainLayout } from "../MainLayout/MainLayout";
import { LimitsRings } from "../LimitsRings/LimitsRings";
import { RightRail } from "../RightRail/RightRail";
import { NAV_ITEMS, type NavId, ROUTE_ONLY_ITEMS, SETTINGS_ITEM } from "../../../state/config";
import { CatalogProvider } from "../../../state/store";
import { ProjectProvider } from "../../../features/projects";
import { NewTaskButton, NewTaskProvider } from "../../../features/tasks";
import { ChatButton, ChatProvider } from "../../../features/chat";
import { navBadgeCount, useNotifications } from "../../../features/notifications";

const NAV_IDS = new Set<NavId>([
  ...NAV_ITEMS.map((n) => n.id),
  ...ROUTE_ONLY_ITEMS.map((n) => n.id),
  SETTINGS_ITEM.id,
]);

function pathnameToNavId(pathname: string): NavId {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment !== undefined && NAV_IDS.has(segment as NavId) ? (segment as NavId) : "overview";
}

function AppShellInner({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const tRoot = useTranslations();
  const pathname = usePathname();

  // Notification discipline (Phase 6.3): the runs nav badge is a pure function of
  // pending approvals + retries-parked runs — no store, no read/unread state.
  //
  // Hooks must run unconditionally on every render of this component instance
  // (AppShellInner persists across client-side navigation within `(dashboard)`,
  // it doesn't remount per route) — so `useNotifications` stays above the `/chat`
  // early return below; only the *derived, non-hook* nav/breadcrumb computation is
  // skipped there.
  const badge = navBadgeCount(useNotifications());

  // Phase 27: `/chat` is a coequal, parallel UI to the HUD — not a screen nested
  // inside it. Bypass MainLayout entirely (no nav rail / top bar / right rail) and
  // render the chat surface fullscreen, while staying inside AppShell's provider
  // stack (ChatProvider survives leaving/returning to `/chat`).
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
  if (isChat) {
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
    ...(item.id === "runs" && badge > 0
      ? { badge, badgeLabel: tRoot("notifications.attention", { count: badge }) }
      : {}),
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
      {/* ProjectProvider (Fáze 11) sits beside CatalogProvider: the active-project
          scope is a dashboard concern, so it mounts here, not in root providers. */}
      <ProjectProvider>
        {/* NewTaskProvider stays the OUTER provider (the position the removed
            VoiceProvider held), so the chat overlay can reach the task flow later. */}
        <NewTaskProvider>
          <ChatProvider>
            <Suspense>
              <AppShellInner>{children}</AppShellInner>
            </Suspense>
          </ChatProvider>
        </NewTaskProvider>
      </ProjectProvider>
    </CatalogProvider>
  );
}
