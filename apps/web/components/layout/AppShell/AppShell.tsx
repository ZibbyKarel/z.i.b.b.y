"use client";

import { type AnchorHTMLAttributes, type ReactNode, Suspense, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ActivityDock,
  AppFrame,
  AppHeader,
  ApprovalCard,
  Button,
  LimitBar,
  Rail,
  Stack,
  SubNav,
  Tab,
  TabList,
  Tabs,
  Typography,
} from "@zibby/design-system";
import { CatalogProvider } from "../../../state/store";
import { NEW_TASK_PAGE_HREF, NewTaskProvider, useNewTaskPageHotkey } from "../../../features/tasks";
import { ChatProvider, CooDock } from "../../../features/chat";
import { CommandPaletteHost, useCommandPaletteHotkey } from "../../../features/command-palette";
import {
  useApprovalsQuery,
  useApproveMutation,
  useRejectMutation,
} from "../../../features/approvals";
import { ApprovalSheet } from "../../../features/approvals/components/ApprovalSheet";
import { TasksDockPanel, useLiveRuns } from "../../../features/runs/components/TasksDockPanel";
import { HIGH_RISK_TYPES, formatWaited } from "../../../features/approvals/approval";
import { counterSuffix } from "../../../features/inbox/inbox";
import { useInboxCounts } from "../../../features/inbox/useInboxCounts";
import { useLimitsQuery } from "../../../features/limits";
import { NotificationBell } from "../../../features/notifications";
import {
  PinPageDialog,
  PinnedRail,
  SubnavPinButton,
  type SubnavPinEntityKind,
  pinHrefFor,
  usePagePins,
} from "../../../features/pins";
import { PageBreadcrumbSlotProvider } from "../PageBreadcrumb";
import { ThemeToggle } from "../ThemeToggle/ThemeToggle";
import { useDockState } from "./useDockState";
import { SECTIONS, type SectionId, type SubTabConfig, sectionForPath } from "../../../state/config";

export enum AppShellTestId {
  NewTask = "app-shell-new-task",
  SettingsCog = "app-shell-settings-cog",
  PinToggle = "app-shell-pin-toggle",
}

/** Top nav sections, minus `system` — settings is reached through the header
 *  cog (`SettingsCog`), its tabs still fill the sub-nav row, and
 *  `/system/settings/*` highlights no top tab (`Tabs` tolerates a `value`
 *  matching no rendered `Tab`). */
const NAV_SECTIONS = SECTIONS.filter((section) => section.id !== "system");

/** `/work/<kind>/<id>` (and its sub-tabs) — a company/project/team detail
 *  page, never its `/new` creation screen (spec step 5). */
function matchEntityDetail(
  pathname: string,
): { kind: SubnavPinEntityKind; id: string; href: string } | null {
  const match = /^\/work\/(companies|projects|teams)\/([^/]+)/.exec(pathname);
  if (!match) return null;
  const [, kind, id] = match as unknown as [string, SubnavPinEntityKind, string];
  if (!id || id === "new") return null;
  return { kind, id, href: `/work/${kind}/${id}` };
}

/** Sets (or clears) the shell's `?approval=` search param over whatever page
 *  is mounted — the ZB-08 sheet reads it directly, so opening it never
 *  navigates away from the current page. */
function useApprovalSheetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const approvalId = searchParams.get("approval");
  const open = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("approval", id);
    router.push(`${pathname}?${next.toString()}` as Route);
  };
  const close = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("approval");
    const qs = next.toString();
    router.push((qs ? `${pathname}?${qs}` : pathname) as Route);
  };
  return { approvalId, open, close };
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
        {NAV_SECTIONS.map((section) => (
          <Tab key={section.id} value={section.id}>
            {t(section.id)}
          </Tab>
        ))}
      </TabList>
    </Tabs>
  );
}

/** The sub-nav tab owning `pathname`: the longest `matchPrefix ?? href` it equals
 *  or prefixes (so a detail page like `/work/projects/x` keeps `/work/projects`
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

/** Header cog → Settings → General. A plain ghost button (DS `Button` renders a
 *  `<button>`, no link mode, hence `router.push`); `aria-current` marks `/system/settings/**`. */
function SettingsCog() {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const onSettings = pathname === "/system/settings" || pathname.startsWith("/system/settings/");
  return (
    <Button
      aria-current={onSettings ? "page" : undefined}
      aria-label={t("settingsAria")}
      data-testid={AppShellTestId.SettingsCog}
      icon="gear"
      intent="ghost"
      onClick={() => router.push("/system/settings/general" as Route)}
      size="sm"
    />
  );
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

function SectionSubNav({
  active,
  trail,
  currentHref,
  onPinRequested,
}: {
  active: SectionId;
  /** The page-breadcrumb portal target, rendered after the tabs. */
  trail: ReactNode;
  currentHref: string;
  onPinRequested: () => void;
}) {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const activeHref = activeSubNavHref(section.tabs, pathname);
  // Inbox counters (global, actionable only) ride in the tab labels — `SubNavItem`
  // has no badge slot. Only fetched while the Inbox section is open.
  const inboxCounts = useInboxCounts(active === "inbox");
  const items = section.tabs.map((tab) => ({
    href: tab.href,
    label:
      t(`subtab.${section.id}.${tab.id}` as Parameters<typeof t>[0]) +
      (active === "inbox" ? counterSuffix(tab.id, inboxCounts) : ""),
    active: tab.href === activeHref,
  }));
  const entity = matchEntityDetail(pathname);
  return (
    <SubNav
      actions={
        <>
          {/* Spec step 5: a company/project/team detail page (never /new) gets
           *  a "+ PIN"/"PINNED" toggle before "+ NEW TASK". */}
          {entity ? (
            <SubnavPinButton
              href={entity.href}
              id={entity.id}
              key={entity.href}
              kind={entity.kind}
            />
          ) : (
            <PagePinToggle currentHref={currentHref} onPinRequested={onPinRequested} />
          )}
          {/* ZB-04b: "+ NEW TASK" opens the dedicated `/work/tasks/new` page
           *  (Option+N does the same from anywhere; the classify-driven dialog
           *  stays reachable via the `N` shortcut). Hidden on that page itself. */}
          {pathname !== NEW_TASK_PAGE_HREF && (
            <Button
              data-testid={AppShellTestId.NewTask}
              icon="plus"
              intent="primary"
              onClick={() => router.push(NEW_TASK_PAGE_HREF as Route)}
              size="sm"
            >
              {tShell("newTask")}
            </Button>
          )}
        </>
      }
      items={items}
      linkComponent={NavLink}
      trail={trail}
    />
  );
}

/** `AppHeader`'s trailing limits cluster — a custom hook (not a component) so
 *  it can return a plain node for `AppHeader`'s named slot rather than one
 *  wrapping element. */
function useHeaderTrailing() {
  const t = useTranslations("shell");
  const { data: limits } = useLimitsQuery();

  return {
    limits: (
      <Stack gap="50">
        <LimitBar label="5H" max={100} value={limits?.rolling.usedPct ?? 0} />
        <LimitBar label={t("week")} max={100} value={limits?.weekly.usedPct ?? 0} />
      </Stack>
    ),
  };
}

/** `Rail`'s "NEEDS YOU" — pending approvals as single-click `ApprovalCard`s
 * (D-014/O-13: no `HoldButton`, even for high-risk — `highRisk` is a marker
 * only). Approve/deny act directly from the card; the whole card is otherwise
 * the click target that opens the full approval sheet. */
function NeedsYouRail({ onOpenApproval }: { onOpenApproval: (id: string) => void }) {
  const t = useTranslations("shell");
  const { data: approvals } = useApprovalsQuery();
  const approve = useApproveMutation();
  const reject = useRejectMutation();
  const pending = approvals ?? [];

  return (
    <Rail
      count={pending.length}
      empty={
        <Typography type="note" variant="tertiary">
          {t("needsYouEmpty")}
        </Typography>
      }
      title={t("needsYou")}
    >
      {/* `Rail`'s `empty` fallback only renders when `children` is entirely
       *  absent, not merely an empty array — an empty `.map()` result is
       *  still "children present" to `Boolean([])`. */}
      {pending.length === 0
        ? undefined
        : pending.map((a) => {
            const highRisk = a.riskType != null && HIGH_RISK_TYPES.has(a.riskType);
            return (
              <ApprovalCard
                agentName={a.skill}
                approveLabel={t("needsYouApprove")}
                approvePending={approve.isPending && approve.variables?.params.id === a.id}
                denyLabel={t("needsYouDeny")}
                denyPending={reject.isPending && reject.variables?.params.id === a.id}
                glyphSeed={a.skill}
                highRisk={highRisk}
                key={a.id}
                meta={a.kind}
                onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
                onDeny={() => reject.mutate({ params: { id: a.id }, body: {} })}
                onOpen={() => onOpenApproval(a.id)}
                openLabel={t("needsYouOpen", { agentName: a.skill })}
                request={a.detail}
                taskRef={a.runId}
                waited={formatWaited(a.requestedAt)}
              />
            );
          })}
    </Rail>
  );
}

function AppShellChrome({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const tShell = useTranslations("shell");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = sectionForPath(pathname);
  const trailing = useHeaderTrailing();
  const approvalSheet = useApprovalSheetParam();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [crumbSlot, setCrumbSlot] = useState<HTMLElement | null>(null);
  const activeTab = activeSubNavTab<SubTabConfig>(
    SECTIONS.find((s) => s.id === active)?.tabs ?? [],
    pathname,
  );
  // A first crumb equal to the tab's href or its prefix just repeats the tab.
  const activeSubHrefs = activeTab ? [activeTab.tab.href, activeTab.prefix] : [];
  useCommandPaletteHotkey(() => setPaletteOpen((o) => !o));
  useNewTaskPageHotkey();

  const currentHref = pinHrefFor(pathname, searchParams.toString());
  const [dockActive, setDockActive] = useDockState();
  const { data: approvals } = useApprovalsQuery();
  const liveCount = useLiveRuns().length;

  return (
    <PageBreadcrumbSlotProvider activeHrefs={activeSubHrefs} element={crumbSlot}>
      <AppFrame
        dock={<CooDock />}
        fullBleed={pathname === "/org"}
        header={
          <AppHeader
            homeHref="/org"
            limits={trailing.limits}
            linkComponent={NavLink}
            menu={<SettingsCog />}
            nav={<SectionNav active={active} />}
            notifications={<NotificationBell />}
            onSearchClick={() => setPaletteOpen(true)}
            themeToggle={<ThemeToggle />}
          />
        }
        rail={
          <ActivityDock
            activeId={dockActive}
            ariaLabel={tShell("dockAria")}
            items={[
              {
                id: "pinned",
                icon: "pin",
                label: tShell("dockPinned"),
                body: <PinnedRail currentHref={currentHref} />,
              },
              {
                id: "needs-you",
                icon: "shield",
                label: tShell("dockNeedsYou"),
                badge: approvals?.length,
                body: <NeedsYouRail onOpenApproval={approvalSheet.open} />,
              },
              {
                id: "tasks",
                icon: "pulse",
                label: tShell("dockTasks"),
                badge: liveCount,
                body: <TasksDockPanel />,
              },
            ]}
            onActiveChange={setDockActive}
          />
        }
        skipLinkLabel={t("skipToContent")}
        subnav={
          <SectionSubNav
            active={active}
            currentHref={currentHref}
            onPinRequested={() => setPinDialogOpen(true)}
            trail={<div ref={setCrumbSlot} />}
          />
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
