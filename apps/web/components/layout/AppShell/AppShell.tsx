"use client";

import { type AnchorHTMLAttributes, type ReactNode, Suspense, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AppFrame,
  AppHeader,
  Button,
  MobileMenu,
  MobileToolbar,
  Stack,
  SubNav,
  Tab,
  TabList,
  Tabs,
  UsagePanel,
} from "@zibby/design-system";
import { CatalogProvider } from "../../../state/store";
import { NEW_TASK_PAGE_HREF, NewTaskProvider, useNewTaskPageHotkey } from "../../../features/tasks";
import { ChatDock, ChatProvider } from "../../../features/chat";
import { CommandPaletteHost, useCommandPaletteHotkey } from "../../../features/command-palette";
import { ApprovalSheet } from "../../../features/approvals/components/ApprovalSheet";
import { useApprovalSheetParam } from "../../../features/approvals/useApprovalSheetParam";
import { counterSuffix } from "../../../features/inbox/inbox";
import { useInboxCounts } from "../../../features/inbox/useInboxCounts";
import { useLimitsQuery } from "../../../features/limits";
import { useIsPhone } from "../../../hooks/useIsPhone";
import { useNow } from "../../../hooks/useNow";
import { MINUTE_MS, formatCountdown } from "../../../utils/time";
import { NotificationBell } from "../../../features/notifications";
import { AutopilotToggle } from "../../../features/autopilot";
import {
  PinPageDialog,
  SubnavPinButton,
  type SubnavPinEntityKind,
  pinHrefFor,
  usePagePins,
} from "../../../features/pins";
import { PageActionsSlotProvider } from "../PageActions";
import { PageBreadcrumbSlotProvider } from "../PageBreadcrumb";
import { SelfUpgrade } from "../SelfUpgrade";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { SECTIONS, type SectionId, type SubTabConfig, sectionForPath } from "../../../state/config";

export enum AppShellTestId {
  NewTask = "app-shell-new-task",
  PinToggle = "app-shell-pin-toggle",
  PageActions = "app-shell-page-actions",
}

/** `/<kind>/<id>` (and its sub-tabs) — a company/project/team detail
 *  page, never its `/new` creation screen (spec step 5). */
function matchEntityDetail(
  pathname: string,
): { kind: SubnavPinEntityKind; id: string; href: string } | null {
  const match = /^\/(companies|projects|teams)\/([^/]+)/.exec(pathname);
  if (!match) return null;
  const [, kind, id] = match as unknown as [string, SubnavPinEntityKind, string];
  if (!id || id === "new") return null;
  return { kind, id, href: `/${kind}/${id}` };
}

/**
 * Adapts `next/link`'s `Link` (which types `href` as `Route | UrlObject`) to
 * `SubNav`/`AppHeader`'s router-agnostic `linkComponent` contract (`href:
 * string`) — the DS component itself never imports `next/link`. `href` is cast
 * once here, at the one seam that needs it, rather than at every call site.
 */
function NavLink({
  href,
  ...rest
}: { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <Link href={href as Route} {...rest} />;
}

/**
 * The section nav (`AppHeader`'s `nav` slot) — a mono `Tabs` bar that navigates
 * instead of switching an internal panel (`AppHeader`'s own doc comment: "the
 * app composes a `Tabs variant=mono`"). Each section's `href` is today's closest
 * existing route (`SECTIONS`, ZB-01) until its own screen phase ships.
 */
function SectionNav({ active }: { active: SectionId }) {
  const t = useTranslations("nav");
  const router = useRouter();
  return (
    <Tabs
      onValueChange={(id) => {
        const section = SECTIONS.find((s) => s.id === id);
        if (section) router.push(section.href);
      }}
      value={active}
      variant="mono"
    >
      <TabList>
        {SECTIONS.map((section) => (
          <Tab key={section.id} value={section.id}>
            {t(section.id)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

/** The sub-nav tab owning `pathname`: the longest `matchPrefix ?? href` it equals
 *  or prefixes (so a detail page like `/projects/x` keeps `/projects`
 *  active). Returns the tab and the prefix that matched. */
function activeSubNavTab<T extends { href: string; matchPrefix?: string }>(
  tabs: readonly T[],
  pathname: string,
): { tab: T; prefix: string } | null {
  let best: { tab: T; prefix: string } | null = null;
  for (const tab of tabs) {
    const prefix = tab.matchPrefix ?? tab.href;
    if (
      (pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
      prefix.length > (best?.prefix.length ?? -1)
    ) {
      best = { tab, prefix };
    }
  }
  return best;
}

function activeSubNavHref(
  tabs: readonly { href: string; matchPrefix?: string }[],
  pathname: string,
): string | null {
  return activeSubNavTab(tabs, pathname)?.tab.href ?? null;
}

/** Sub-nav page-pin toggle — pins unpinned pages via `PinPageDialog`
 *  (`onPinRequested`), unpins immediately. */
function PagePinToggle({
  currentHref,
  onPinRequested,
}: {
  currentHref: string;
  onPinRequested: () => void;
}) {
  const t = useTranslations("shell");
  const { isPagePinned, unpinPage } = usePagePins();
  const pinned = isPagePinned(currentHref);
  return (
    <Button
      aria-label={t(pinned ? "pageUnpinAria" : "pagePinAria")}
      aria-pressed={pinned}
      data-testid={AppShellTestId.PinToggle}
      icon="pin"
      intent={pinned ? "secondary" : "ghost"}
      onClick={() => (pinned ? unpinPage(currentHref) : onPinRequested())}
      size="sm"
    />
  );
}

/** Page-pin control: a company/project/team detail page (never /new) gets the
 *  entity "+ PIN"/"PINNED" toggle (spec step 5), every other page the page toggle. */
function PinControl({
  pathname,
  currentHref,
  onPinRequested,
}: {
  pathname: string;
  currentHref: string;
  onPinRequested: () => void;
}) {
  const entity = matchEntityDetail(pathname);
  return entity ? (
    <SubnavPinButton href={entity.href} id={entity.id} key={entity.href} kind={entity.kind} />
  ) : (
    <PagePinToggle currentHref={currentHref} onPinRequested={onPinRequested} />
  );
}

/** ZB-04b: "+ NEW TASK" opens the dedicated `/work/tasks/new` page (Option+N does
 *  the same from anywhere; the classify-driven dialog stays reachable via the `N`
 *  shortcut). Hidden on that page itself; icon-only on the phone toolbar. */
function NewTaskButton({ pathname, iconOnly }: { pathname: string; iconOnly: boolean }) {
  const tShell = useTranslations("shell");
  const router = useRouter();
  if (pathname === NEW_TASK_PAGE_HREF) return null;
  return (
    <Button
      aria-label={tShell("newTask")}
      data-testid={AppShellTestId.NewTask}
      icon="plus"
      intent="primary"
      onClick={() => router.push(NEW_TASK_PAGE_HREF as Route)}
      size="sm"
    >
      {iconOnly ? null : tShell("newTask")}
    </Button>
  );
}

function SectionSubNav({
  active,
  trail,
  pageActions,
  currentHref,
  onPinRequested,
}: {
  active: SectionId;
  /** The page-breadcrumb portal target, rendered after the tabs. */
  trail: ReactNode;
  /** The page-actions portal target, rendered first in the actions slot. */
  pageActions: ReactNode;
  currentHref: string;
  onPinRequested: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const activeHref = activeSubNavHref(section.tabs, pathname);
  // Inbox counters (global, actionable only) ride in the tab labels — `SubNavItem`
  // has no badge slot. Only fetched while the Dashboard section is open.
  const inboxCounts = useInboxCounts(active === "dashboard");
  const items = section.tabs.map((tab) => ({
    href: tab.href,
    label:
      t(`subtab.${section.id}.${tab.id}` as Parameters<typeof t>[0]) +
      (active === "dashboard" ? counterSuffix(tab.id, inboxCounts) : ""),
    active: tab.href === activeHref,
  }));
  return (
    <SubNav
      actions={
        <>
          {pageActions}
          <PinControl
            currentHref={currentHref}
            onPinRequested={onPinRequested}
            pathname={pathname}
          />
          <NewTaskButton iconOnly={false} pathname={pathname} />
        </>
      }
      items={items}
      linkComponent={NavLink}
      trail={trail}
    />
  );
}

/** Phone navigation: the whole section/sub-page tree in a hamburger sheet. */
function PhoneMenu({ pathname }: { pathname: string }) {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const activeId = sectionForPath(pathname);
  const sections = SECTIONS.map((section) => {
    const isActive = section.id === activeId;
    const activeHref = isActive ? activeSubNavHref(section.tabs, pathname) : null;
    return {
      id: section.id,
      label: t(section.id),
      href: section.href,
      active: isActive,
      items: section.tabs.map((tab) => ({
        href: tab.href,
        label: t(`subtab.${section.id}.${tab.id}` as Parameters<typeof t>[0]),
        active: tab.href === activeHref,
      })),
    };
  });
  return (
    <MobileMenu
      closeLabel={tShell("menuClose")}
      label={tShell("menu")}
      linkComponent={NavLink}
      sections={sections}
    />
  );
}

/** `AppHeader`'s trailing limits cluster — a custom hook (not a component) so
 *  it can return a plain node for `AppHeader`'s named slot rather than one
 *  wrapping element. */
function useHeaderTrailing() {
  const t = useTranslations("shell");
  const { data: limits } = useLimitsQuery();
  const now = useNow(MINUTE_MS);
  const resetsIn = (resetsAt: number | null | undefined) =>
    resetsAt == null ? undefined : formatCountdown(resetsAt - now);

  return {
    limits: (
      <Stack align="center" direction="row" gap="100">
        <SelfUpgrade />
        <UsagePanel
          items={[
            {
              label: "5H",
              value: limits?.rolling.usedPct ?? 0,
              resetsIn: resetsIn(limits?.rolling.resetsAt),
            },
            {
              label: t("week"),
              value: limits?.weekly.usedPct ?? 0,
              resetsIn: resetsIn(limits?.weekly.resetsAt),
            },
          ]}
        />
      </Stack>
    ),
  };
}

function AppShellChrome({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const phone = useIsPhone();
  const searchParams = useSearchParams();
  const active = sectionForPath(pathname);
  const trailing = useHeaderTrailing();
  const approvalSheet = useApprovalSheetParam();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [crumbSlot, setCrumbSlot] = useState<HTMLElement | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const activeTab = activeSubNavTab<SubTabConfig>(
    SECTIONS.find((s) => s.id === active)?.tabs ?? [],
    pathname,
  );
  // A first crumb equal to the tab's href or its prefix just repeats the tab.
  const activeSubHrefs = activeTab ? [activeTab.tab.href, activeTab.prefix] : [];
  useCommandPaletteHotkey(() => setPaletteOpen((o) => !o));
  useNewTaskPageHotkey();

  const currentHref = pinHrefFor(pathname, searchParams.toString());
  const onPinRequested = () => setPinDialogOpen(true);
  // `display: contents` — the portalled controls join the actions row's own flex
  // gap; an empty slot takes no room. The slot lives in the sub-nav (desktop) or
  // the toolbar (phone).
  const pageActions = (
    <Stack
      data-testid={AppShellTestId.PageActions}
      ref={setActionsSlot}
      style={{ display: "contents" }}
    />
  );

  return (
    <PageBreadcrumbSlotProvider activeHrefs={activeSubHrefs} element={crumbSlot}>
      <PageActionsSlotProvider element={actionsSlot}>
        <AppFrame
          dock={<ChatDock />}
          fullBleed={pathname === "/dashboard"}
          header={
            phone ? (
              <MobileToolbar
                actions={
                  <>
                    {pageActions}
                    <AutopilotToggle />
                    <PinControl
                      currentHref={currentHref}
                      onPinRequested={onPinRequested}
                      pathname={pathname}
                    />
                    <NewTaskButton iconOnly pathname={pathname} />
                    <NotificationBell />
                  </>
                }
                leading={<PhoneMenu pathname={pathname} />}
              />
            ) : (
              <AppHeader
                autopilot={<AutopilotToggle />}
                homeHref="/dashboard"
                limits={trailing.limits}
                linkComponent={NavLink}
                nav={<SectionNav active={active} />}
                notifications={<NotificationBell />}
                onSearchClick={() => setPaletteOpen(true)}
                themeToggle={<ThemeToggle />}
              />
            )
          }
          skipLinkLabel={t("skipToContent")}
          subnav={
            phone ? undefined : (
              <SectionSubNav
                active={active}
                currentHref={currentHref}
                onPinRequested={onPinRequested}
                pageActions={pageActions}
                trail={<div ref={setCrumbSlot} />}
              />
            )
          }
        >
          {children}
          <ApprovalSheet approvalId={approvalSheet.approvalId} onClose={approvalSheet.close} />
          <CommandPaletteHost
            onOpenApproval={approvalSheet.open}
            onOpenChange={setPaletteOpen}
            open={paletteOpen}
          />
          {pinDialogOpen && (
            <PinPageDialog href={currentHref} onClose={() => setPinDialogOpen(false)} />
          )}
        </AppFrame>
      </PageActionsSlotProvider>
    </PageBreadcrumbSlotProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <CatalogProvider>
      {/* NewTaskProvider stays the outer provider — see `SectionSubNav`'s
          "+ NEW TASK" action and the retired HUD's own doc history. */}
      <NewTaskProvider>
        <ChatProvider>
          <Suspense>
            <AppShellChrome>{children}</AppShellChrome>
          </Suspense>
        </ChatProvider>
      </NewTaskProvider>
    </CatalogProvider>
  );
}
