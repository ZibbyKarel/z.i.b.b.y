import { type ReactNode, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Container, Divider, Stack, Surface } from "@zibby/design-system";
import type { NavItem } from "@zibby/design-system";
import { TopBar } from "../TopBar/TopBar";
import { BrandLogo } from "../BrandLogo/BrandLogo";
import { Sidebar } from "../Sidebar/Sidebar";

const RAIL_HIDDEN_KEY = "zibby.railHidden";

/**
 * Right-rail visibility, persisted in localStorage — SSR-safe lazy init
 * (default visible) plus a write-through effect on every change.
 */
function useRailHidden(): [boolean, (next: boolean) => void] {
  const [railHidden, setRailHidden] = useState(() =>
    typeof window === "undefined" ? false : localStorage.getItem(RAIL_HIDDEN_KEY) === "true",
  );

  useEffect(() => {
    localStorage.setItem(RAIL_HIDDEN_KEY, String(railHidden));
  }, [railHidden]);

  return [railHidden, setRailHidden];
}

export interface MainLayoutProps {
  navItems: NavItem[];
  activeNav: string;
  footerItem?: NavItem;
  breadcrumb: string;
  walletSlot?: ReactNode;
  taskSlot?: ReactNode;
  chatSlot?: ReactNode;
  /** The app-wide project switcher (Fáze 11), threaded to the top bar. */
  projectSlot?: ReactNode;
  /**
   * Persistent right rail, mirrored on the left navigation: when provided it
   * renders as a fixed-width aside that stays visible on every page.
   */
  railSlot?: ReactNode;
  children: ReactNode;
}

export function MainLayout({
  navItems,
  activeNav,
  footerItem,
  breadcrumb,
  walletSlot,
  taskSlot,
  chatSlot,
  projectSlot,
  railSlot,
  children,
}: MainLayoutProps) {
  const t = useTranslations("sidebar");
  const [railHidden, setRailHidden] = useRailHidden();
  return (
    <Surface background="scene">
      <Stack
        aria-label={t("navLabel")}
        as="nav"
        shrink={false}
        style={{ width: 224, backgroundColor: "var(--color-background-deep)" }}
      >
        <Container
          grow
          padding={["300", "150"]}
          style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          <BrandLogo />
          <Sidebar {...{ activeNav, footerItem, navItems }} />
        </Container>
      </Stack>

      <Divider orientation="vertical" />

      {}
      <Stack grow style={{ minWidth: 0 }}>
        <TopBar
          breadcrumb={breadcrumb}
          chatSlot={chatSlot}
          onToggleRail={railSlot ? () => setRailHidden(!railHidden) : undefined}
          projectSlot={projectSlot}
          railHidden={railSlot ? railHidden : undefined}
          taskSlot={taskSlot}
          walletSlot={walletSlot}
        />
        <Container grow overflow="auto" padding={["300", "350"]} position="relative">
          {children}
        </Container>
      </Stack>

      {railSlot && !railHidden && (
        <>
          <Divider orientation="vertical" />
          <Stack
            aria-label={t("railLabel")}
            as="aside"
            shrink={false}
            style={{ width: 324, backgroundColor: "var(--color-background-deep)" }}
          >
            <Container grow overflow="auto" padding={["300", "250"]}>
              {railSlot}
            </Container>
          </Stack>
        </>
      )}
    </Surface>
  );
}
