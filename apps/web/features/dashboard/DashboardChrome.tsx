"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  DesignSystemProvider,
  PartialTheme,
  type LinkComponentType,
} from "@zibby/design-system";
import { MainLayout } from "./components/MainLayout";
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

export type ContextName = "home" | "work";

// THIS IS TEMPORARY. In the end this will be a dinamic list of contexts user can create
export function contextTokens(context: ContextName): PartialTheme {
  if (context === "work") {
    return {
      colorAccent: "#5b8def",
      colorAccentDim: "rgba(91,141,239,0.16)",
      colorAccentContrast: "#0a0c10",
      colorAccentGlow: "rgba(91,141,239,0.4)",
      shadowGlowAccent: "0 0 16px rgba(91,141,239,0.4)",
    };
  }
  return {
    colorAccent: "#f0b429",
    colorAccentDim: "rgba(240,180,41,0.16)",
    colorAccentContrast: "#0a0c10",
    colorAccentGlow: "rgba(240,180,41,0.4)",
    shadowGlowAccent: "0 0 16px rgba(240,180,41,0.4)",
  };
}

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
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();

  const rawCtx = params.get("ctx") ?? "home";
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
        <MainLayout
          context={context}
          onContextChange={handleContextChange}
          navItems={navItemsWithCtx}
          activeNav={activeNav}
          onNavigate={(id) => router.push(hrefWithCtx(`/${id}`, rawCtx))}
          footerItem={footerWithCtx}
          breadcrumb={NAV_LABELS[activeNav] ?? "Přehled"}
          walletSlot={
            <LimitsWidget limits={CLAUDE_LIMITS} credit={AGENT_SDK} />
          }
          linkComponent={Link as LinkComponentType}
        >
          {children}
        </MainLayout>
      </DesignSystemProvider>
    </DashboardContext.Provider>
  );
}

export function DashboardChrome({ children }: { children: ReactNode }) {
  return (
    <DashboardStoreProvider>
      <Suspense
        fallback={
          <div style={{ height: "100%", background: "var(--bg-surface)" }} />
        }
      >
        <ChromeInner>{children}</ChromeInner>
      </Suspense>
    </DashboardStoreProvider>
  );
}
