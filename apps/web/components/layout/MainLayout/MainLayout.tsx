import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Container, Divider, Stack, Surface } from "@zibby/design-system";
import type { NavItem } from "@zibby/design-system";
import { TopBar } from "../TopBar/TopBar";
import { BrandLogo } from "../BrandLogo/BrandLogo";
import { Sidebar } from "../Sidebar/Sidebar";

export interface MainLayoutProps {
  navItems: NavItem[];
  activeNav: string;
  footerItem?: NavItem;
  breadcrumb: string;
  walletSlot?: ReactNode;
  taskSlot?: ReactNode;
  voiceSlot?: ReactNode;
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
  voiceSlot,
  railSlot,
  children,
}: MainLayoutProps) {
  const t = useTranslations("sidebar");
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
          taskSlot={taskSlot}
          voiceSlot={voiceSlot}
          walletSlot={walletSlot}
        />
        <Container grow overflow="auto" padding={["300", "350"]} position="relative">
          {children}
        </Container>
      </Stack>

      {railSlot && (
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
