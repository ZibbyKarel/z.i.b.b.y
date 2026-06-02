"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { type NavItem } from "@zibby/design-system";
import { MainLayout } from "./MainLayout";
import { NAV_ITEMS, type NavId, SETTINGS_ITEM } from "../../state/config";
import { CatalogProvider } from "../../state/store";

const NAV_IDS = new Set<NavId>([...NAV_ITEMS.map((n) => n.id), SETTINGS_ITEM.id]);

function pathnameToNavId(pathname: string): NavId {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment !== undefined && NAV_IDS.has(segment as NavId) ? (segment as NavId) : "overview";
}

function AppShellInner({ children }: { children: ReactNode }) {
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

  const breadcrumb = t(activeNav);

  return (
    <MainLayout
      activeNav={activeNav}
      breadcrumb={breadcrumb}
      footerItem={footerItem}
      navItems={navItems}
    >
      {children}
    </MainLayout>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      <Suspense>
        <AppShellInner>{children}</AppShellInner>
      </Suspense>
    </CatalogProvider>
  );
}
