"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type NavItem } from "@zibby/design-system";
import { MainLayout } from "../MainLayout/MainLayout";
import { LimitsRings } from "../LimitsRings/LimitsRings";
import { RightRail } from "../RightRail/RightRail";
import { NAV_ITEMS, type NavId, ROUTE_ONLY_ITEMS, SETTINGS_ITEM } from "../../../state/config";
import { CatalogProvider } from "../../../state/store";
import { VoiceButton, VoiceProvider } from "../../../features/voice";
import { NewTaskButton, NewTaskProvider } from "../../../features/tasks";
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
  const activeNav = pathnameToNavId(pathname);

  // Notification discipline (Phase 6.3): the runs nav badge is a pure function of
  // pending approvals + retries-parked runs — no store, no read/unread state.
  const badge = navBadgeCount(useNotifications());

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
      footerItem={footerItem}
      navItems={navItems}
      railSlot={activeNav === "overview" ? <RightRail /> : undefined}
      taskSlot={<NewTaskButton />}
      voiceSlot={<VoiceButton />}
      walletSlot={<LimitsRings />}
    >
      {children}
    </MainLayout>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      <VoiceProvider>
        <NewTaskProvider>
          <Suspense>
            <AppShellInner>{children}</AppShellInner>
          </Suspense>
        </NewTaskProvider>
      </VoiceProvider>
    </CatalogProvider>
  );
}
