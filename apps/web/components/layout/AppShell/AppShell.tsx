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
  LimitBar,
  Rail,
  Row,
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
import { useApprovalsQuery, useApproveMutation } from "../../../features/approvals";
import { ApprovalSheet } from "../../../features/approvals/components/ApprovalSheet";
import { HIGH_RISK_TYPES, formatWaited } from "../../../features/approvals/approval";
import { useRunsQuery } from "../../../features/runs";
import { useLimitsQuery } from "../../../features/limits";
import { useSystemConfigQuery } from "../../../features/system";
import { SECTIONS, type SectionId, sectionForPath } from "../../../state/config";

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
        {SECTIONS.map((section) => (
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
  return (
    <SubNav
      actions={
        // ZB-04b: "+ NEW TASK" opens the dedicated `/work/tasks/new` page
        // (the classify-driven dialog stays reachable via the `N` shortcut and
        // the other call sites that seed it with an initial target/context).
        <Button
          icon="plus"
          intent="ghost"
          onClick={() => router.push("/work/tasks/new" as Route)}
          size="sm"
        >
          {tShell("newTask")}
        </Button>
      }
      items={items}
      linkComponent={NavLink}
    />
  );
}

/** `AppHeader`'s trailing operator/active-count/limits cluster — a custom hook
 *  (not a component) so it can return plain nodes for `AppHeader`'s named slots
 *  rather than one wrapping element. */
function useHeaderTrailing() {
  const t = useTranslations("shell");
  const { data: config } = useSystemConfigQuery();
  const { runs } = useRunsQuery();
  const { data: limits } = useLimitsQuery();
  const activeCount = runs.filter((r) => r.status === "running").length;

  return {
    operator: (
      <Typography tracking="wider" type="labelSm" variant="secondary">
        {config?.operatorName ?? t("operatorFallback")}
      </Typography>
    ),
    activeCount: (
      <Typography tracking="wider" type="labelSm" variant="secondary">
        {activeCount} {t("active")}
      </Typography>
    ),
    limits: (
      <Row gap="150">
        <LimitBar label="5H" max={100} value={limits?.rolling.usedPct ?? 0} />
        <LimitBar label={t("week")} max={100} value={limits?.weekly.usedPct ?? 0} />
      </Row>
    ),
  };
}

/** `Rail`'s "NEEDS YOU" — pending approvals as single-click `ApprovalCard`s
 * (D-014/O-13: no `HoldButton`, even for high-risk — `highRisk` is a marker
 * only). "Open" and the high-risk path both go to `LEGACY_APPROVAL_SURFACE`;
 * quick-approve handles the common non-high-risk case in place. */
function NeedsYouRail({ onOpenApproval }: { onOpenApproval: (id: string) => void }) {
  const t = useTranslations("shell");
  const { data: approvals } = useApprovalsQuery();
  const approve = useApproveMutation();
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
                density="row"
                glyphSeed={a.skill}
                highRisk={highRisk}
                key={a.id}
                meta={a.kind}
                onApprove={() => approve.mutate({ params: { id: a.id }, body: {} })}
                // Deny takes a reason (Flow B), so it opens the sheet rather
                // than denying blind from the rail.
                onDeny={() => onOpenApproval(a.id)}
                onOpen={() => onOpenApproval(a.id)}
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
  const active = sectionForPath(pathname);
  const trailing = useHeaderTrailing();
  const approvalSheet = useApprovalSheetParam();
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(() => setPaletteOpen((o) => !o));

  return (
    <AppFrame
      dock={<CooDock />}
      header={
        <AppHeader
          activeCount={trailing.activeCount}
          limits={trailing.limits}
          linkComponent={NavLink}
          nav={<SectionNav active={active} />}
          onSearchClick={() => setPaletteOpen(true)}
          operator={trailing.operator}
          settingsHref="/system/settings/general"
        />
      }
      rail={<NeedsYouRail onOpenApproval={approvalSheet.open} />}
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
