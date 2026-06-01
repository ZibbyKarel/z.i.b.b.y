"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  DesignSystemProvider,
  DashboardShell,
  contextTokens,
  type ContextName,
} from "@zibby/design-system";
import {
  NAV_ITEMS,
  NAV_LABELS,
  SETTINGS_ITEM,
  CLAUDE_LIMITS,
  AGENT_SDK,
} from "./config";
import { DashboardStoreProvider } from "./store";
import { DashboardContext } from "./dashboardContext";
import { LimitsWidget } from "./components/LimitsWidget";

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
  const pathname  = usePathname();
  const params    = useSearchParams();
  const router    = useRouter();

  const rawCtx  = params.get("ctx") ?? "home";
  const context = (rawCtx === "work" ? "work" : "home") as ContextName;
  const activeNav = pathnameToNavId(pathname);

  const navItemsWithCtx = NAV_ITEMS.map((item) => ({
    ...item,
    href: hrefWithCtx(item.href ?? `/${item.id}`, rawCtx),
  }));

  const footerWithCtx = {
    ...SETTINGS_ITEM,
    href: hrefWithCtx(SETTINGS_ITEM.href ?? "/settings", rawCtx),
  };

  function handleContextChange(next: ContextName) {
    const search = next === "home" ? "" : `?ctx=${next}`;
    router.replace(`${pathname}${search}`);
  }

  return (
    <DashboardContext.Provider value={{ context }}>
    <DesignSystemProvider theme="dark" tokens={contextTokens(context)}>
      <DashboardShell
        context={context}
        onContextChange={handleContextChange}
        navItems={navItemsWithCtx}
        activeNav={activeNav}
        onNavigate={(id) => router.push(hrefWithCtx(`/${id}`, rawCtx))}
        footerItem={footerWithCtx}
        breadcrumb={NAV_LABELS[activeNav] ?? "Přehled"}
        walletSlot={<LimitsWidget limits={CLAUDE_LIMITS} credit={AGENT_SDK} />}
        linkComponent={Link as Parameters<typeof DashboardShell>[0]["linkComponent"]}
      >
        {children}
      </DashboardShell>
    </DesignSystemProvider>
    </DashboardContext.Provider>
  );
}

export function DashboardChrome({ children }: { children: ReactNode }) {
  return (
    <DashboardStoreProvider>
      <Suspense fallback={<div style={{ height: "100%", background: "var(--bg-surface)" }} />}>
        <ChromeInner>{children}</ChromeInner>
      </Suspense>
    </DashboardStoreProvider>
  );
}
