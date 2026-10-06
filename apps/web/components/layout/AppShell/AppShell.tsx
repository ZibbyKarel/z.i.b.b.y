"use client";

import { type AnchorHTMLAttributes, type ReactNode, Suspense, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AppFrame,
  AppHeader,
  ApprovalCard,
  Button,
  Container,
  LimitBar,
  MenuButton,
  type MenuButtonEntry,
  Rail,
  Stack,
  SubNav,
  Tab,
  TabList,
  Tabs,
  Typography,
} from "@zibby/design-system";
import { CatalogProvider } from "../../../state/store";
import { NewTaskProvider } from "../../../features/tasks";
import { ChatProvider, CooDock } from "../../../features/chat";
import { CommandPaletteHost, useCommandPaletteHotkey } from "../../../features/command-palette";
import {
  useApprovalsQuery,
  useApproveMutation,
  useRejectMutation,
} from "../../../features/approvals";
import { ApprovalSheet } from "../../../features/approvals/components/ApprovalSheet";
import { RunningRail } from "../../../features/runs/components/RunningRail";
import { HIGH_RISK_TYPES, formatWaited } from "../../../features/approvals/approval";
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
import { SECTIONS, type SectionId, sectionForPath } from "../../../state/config";

/** Top nav sections, minus `system` (spec step 1) — its own route group keeps
 *  working via `sectionForPath`/`SECTIONS` (the sub-nav still shows its tabs);
 *  it just never gets a clickable top tab, and `/system/*` highlights nothing
 *  up there (`Tabs` tolerates a `value` matching no rendered `Tab`). */
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

function SectionSubNav({ active }: { active: SectionId }) {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const items = section.tabs.map((tab) => ({
    href: tab.href,
    label: t(`subtab.${section.id}.${tab.id}` as Parameters<typeof t>[0]),
    active: tab.href === pathname,
  }));
  const entity = matchEntityDetail(pathname);
  return (
    <SubNav
      actions={
        <>
          {/* Spec step 5: a company/project/team detail page (never /new) gets
           *  a "+ PIN"/"PINNED" toggle before "+ NEW TASK". */}
          {entity && (
            <SubnavPinButton
              href={entity.href}
              id={entity.id}
              key={entity.href}
              kind={entity.kind}
            />
          )}
          {/* ZB-04b: "+ NEW TASK" opens the dedicated `/work/tasks/new` page
           *  (the classify-driven dialog stays reachable via the `N` shortcut
           *  and the other call sites that seed it with an initial
           *  target/context). */}
          <Button
            icon="plus"
            intent="primary"
            onClick={() => router.push("/work/tasks/new" as Route)}
            size="sm"
          >
            {tShell("newTask")}
          </Button>
        </>
      }
      items={items}
      linkComponent={NavLink}
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

/** The ⋮ overflow menu (`AppHeader`'s `menu` slot, spec step 2) — the page-pin
 *  toggle (opens `PinPageDialog` to pin, unpins immediately), then SETTINGS/
 *  REGISTRIES (today's System sub-tab hrefs, `SECTIONS` — the top tab is gone
 *  but these routes still work, spec step 1). */
function useHeaderMenu(currentHref: string, onPinRequested: () => void): MenuButtonEntry[] {
  const t = useTranslations("shell");
  const { isPagePinned, unpinPage } = usePagePins();
  const pinned = isPagePinned(currentHref);
  const system = SECTIONS.find((s) => s.id === "system");
  const settingsHref = system?.tabs.find((tab) => tab.id === "settings")?.href ?? system?.href;
  const registriesHref = system?.tabs.find((tab) => tab.id === "registries")?.href ?? system?.href;

  return [
    pinned
      ? {
          id: "pin",
          label: t("menuUnpin"),
          trailing: "●",
          onSelect: () => unpinPage(currentHref),
        }
      : { id: "pin", label: t("menuPin"), trailing: "+", onSelect: onPinRequested },
    { id: "divider-1", divider: true },
    ...(settingsHref
      ? [{ id: "settings", label: t("menuSettings"), trailing: "⚙", href: settingsHref }]
      : []),
    ...(registriesHref
      ? [{ id: "registries", label: t("menuRegistries"), href: registriesHref }]
      : []),
  ];
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
  useCommandPaletteHotkey(() => setPaletteOpen((o) => !o));

  const currentHref = pinHrefFor(pathname, searchParams.toString());
  const menuItems = useHeaderMenu(currentHref, () => setPinDialogOpen(true));

  return (
    <AppFrame
      dock={<CooDock />}
      header={
        <AppHeader
          homeHref="/org"
          limits={trailing.limits}
          linkComponent={NavLink}
          menu={
            <MenuButton
              ariaLabel={tShell("menuAriaLabel")}
              items={menuItems}
              linkComponent={NavLink}
              variant="bordered"
            />
          }
          nav={<SectionNav active={active} />}
          notifications={<NotificationBell />}
          onSearchClick={() => setPaletteOpen(true)}
        />
      }
      rail={
        <Stack direction="col" style={{ height: "100%", minHeight: 0 }}>
          <Container shrink={false}>
            <PinnedRail currentHref={currentHref} />
          </Container>
          <Container grow minHeight="0">
            <Stack direction="col" style={{ height: "100%", minHeight: 0 }}>
              <Container height="50%" minHeight="0">
                <NeedsYouRail onOpenApproval={approvalSheet.open} />
              </Container>
              <Container height="50%" minHeight="0">
                <RunningRail />
              </Container>
            </Stack>
          </Container>
        </Stack>
      }
      railToggleLabel={tShell("needsYouToggle")}
      skipLinkLabel={t("skipToContent")}
      subnav={<SectionSubNav active={active} />}
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
