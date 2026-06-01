"use client";

import { type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { type LinkComponentType } from "@zibby/design-system";
import { MainLayout } from "./components/MainLayout";
import {
  AGENT_SDK,
  CLAUDE_LIMITS,
  NAV_ITEMS,
  NAV_LABELS,
  SETTINGS_ITEM,
} from "./config";
import { DashboardStoreProvider } from "./store";
import { LimitsWidget } from "./components/LimitsWidget";
import type { ContextName } from "../../domain";
import { useGlobalStateContext } from "apps/web/global/contexts/GlobalStateContext";

function pathnameToNavId(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean)[0] ?? "overview";
  return segment;
}

/** Appends the current ?ctx= param to a href so context survives navigation. */
export function hrefWithCtx(href: string, ctx: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${ctx !== "home" ? `${sep}ctx=${ctx}` : ""}`;
}

function ChromeInner({ children }: { children: ReactNode }) {
  const { context } = useGlobalStateContext();
  const pathname = usePathname();
  const router = useRouter();
  const activeNav = pathnameToNavId(pathname);

  const navItemsWithCtx = NAV_ITEMS.map((item) => ({
    ...item,
    href: hrefWithCtx(item.href ?? `/${item.id}`, context),
  }));

  const footerWithCtx = {
    ...SETTINGS_ITEM,
    href: hrefWithCtx(SETTINGS_ITEM.href ?? "/settings", context),
  };

  function handleContextChange(next: ContextName) {
    const search = next === "home" ? "" : `?ctx=${next}`;
    router.replace(`${pathname}${search}`);
  }

  return (
    <MainLayout
      activeNav={activeNav}
      breadcrumb={NAV_LABELS[activeNav] ?? "Přehled"}
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

export function DashboardChrome({ children }: { children: ReactNode }) {
  return (
    <DashboardStoreProvider>
      <ChromeInner>{children}</ChromeInner>
    </DashboardStoreProvider>
  );
}
