"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type LinkComponentType, type NavItem } from "@zibby/design-system";
import { MainLayout } from "./MainLayout";
import {
  AGENT_SDK,
  CLAUDE_LIMITS,
  NAV_ITEMS,
  SETTINGS_ITEM,
} from "../../state/config";
import { DashboardStoreProvider } from "../../state/store";
import { hrefWithCtx } from "../../state/routing";
import { LimitsWidget } from "./LimitsWidget";
import type { ContextName } from "../../domain";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

const NAV_IDS = new Set(NAV_ITEMS.map((n) => n.id).concat(SETTINGS_ITEM.id));

function pathnameToNavId(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "overview";
  return segment;
}

function AppShellInner({ children }: { children: ReactNode }) {
  const { context } = useGlobalStateContext();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const activeNav = pathnameToNavId(pathname);

  const navItemsWithCtx: NavItem[] = NAV_ITEMS.map((item) => ({
    ...item,
    label: t(item.id),
    href: hrefWithCtx(item.href, context),
  }));

  const footerWithCtx: NavItem = {
    ...SETTINGS_ITEM,
    label: t(SETTINGS_ITEM.id),
    href: hrefWithCtx(SETTINGS_ITEM.href, context),
  };

  const breadcrumb = t(NAV_IDS.has(activeNav) ? activeNav : "overview");

  function handleContextChange(next: ContextName) {
    const search = next === "home" ? "" : `?ctx=${next}`;
    router.replace(`${pathname}${search}`);
  }

  return (
    <MainLayout
      activeNav={activeNav}
      breadcrumb={breadcrumb}
      context={context}
      footerItem={footerWithCtx}
      linkComponent={Link as LinkComponentType}
      navItems={navItemsWithCtx}
      onContextChange={handleContextChange}
      onNavigate={(id) => router.push(hrefWithCtx(`/${id}`, context))}
      walletSlot={<LimitsWidget credit={AGENT_SDK} limits={CLAUDE_LIMITS} />}
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
