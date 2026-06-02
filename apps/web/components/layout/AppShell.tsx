"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type NavItem } from "@zibby/design-system";
import { MainLayout } from "./MainLayout";
import { NAV_ITEMS, SETTINGS_ITEM } from "../../state/config";
import { DashboardStoreProvider } from "../../state/store";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

const NAV_IDS = new Set(NAV_ITEMS.map((n) => n.id).concat(SETTINGS_ITEM.id));

function pathnameToNavId(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "overview";
  return segment;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { context, setContext } = useGlobalStateContext();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const activeNav = pathnameToNavId(pathname);

  const navItems: NavItem[] = NAV_ITEMS.map((item) => ({
    ...item,
    label: t(item.id),
  }));

  const footerItem: NavItem = {
    ...SETTINGS_ITEM,
    label: t(SETTINGS_ITEM.id),
  };

  const breadcrumb = t(NAV_IDS.has(activeNav) ? activeNav : "overview");

  return (
    <MainLayout
      activeNav={activeNav}
      breadcrumb={breadcrumb}
      context={context}
      footerItem={footerItem}
      navItems={navItems}
      onContextChange={setContext}
    >
      {children}
    </MainLayout>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DashboardStoreProvider>
      <AppShellInner>{children}</AppShellInner>
    </DashboardStoreProvider>
  );
}
