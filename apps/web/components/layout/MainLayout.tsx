import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Container,
  Divider,
  List,
  ListItem,
  ListItemBadge,
  ListItemIcon,
  ListItemText,
  Stack,
  Surface,
} from "@zibby/design-system";
import type { NavItem } from "@zibby/design-system";
import type { ContextName } from "../../domain";
import { TopBar } from "./TopBar/TopBar";
import { BrandLogo } from "./BrandLogo";

export interface MainLayoutProps {
  context: ContextName;
  onContextChange: (context: ContextName) => void;
  navItems: NavItem[];
  activeNav: string;
  footerItem?: NavItem;
  breadcrumb: string;
  walletSlot?: ReactNode;
  onCommand?: () => void;
  children: ReactNode;
}

export function MainLayout({
  context,
  onContextChange,
  navItems,
  activeNav,
  footerItem,
  breadcrumb,
  walletSlot,
  onCommand,
  children,
}: MainLayoutProps) {
  const t = useTranslations("sidebar");
  return (
    <Surface grid scanlines>
      <Stack
        aria-label={t("navLabel")}
        as="nav"
        shrink={false}
        style={{ width: 224, backgroundColor: "var(--color-background)" }}
      >
        <Container
          grow
          padding={["300", "150"]}
          style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          <BrandLogo />
          <Stack grow style={{ minHeight: 0 }}>
            <List>
              {navItems.map((item) => (
                <Link
                  href={item.href ?? "/"}
                  key={item.id}
                  style={{ display: "block" }}
                >
                  <ListItem active={item.id === activeNav}>
                    <ListItemIcon glyph={item.glyph} />
                    <ListItemText>{item.label}</ListItemText>
                    {item.badge ? (
                      <ListItemBadge>{item.badge}</ListItemBadge>
                    ) : null}
                  </ListItem>
                </Link>
              ))}
            </List>
            {footerItem && (
              <Container style={{ marginTop: "auto" }}>
                <Divider />
                <Container padding={["75", "0", "0", "0"]}>
                  <Link
                    href={footerItem.href ?? "/"}
                    style={{ display: "block" }}
                  >
                    <ListItem active={footerItem.id === activeNav}>
                      <ListItemIcon glyph={footerItem.glyph} />
                      <ListItemText>{footerItem.label}</ListItemText>
                    </ListItem>
                  </Link>
                </Container>
              </Container>
            )}
          </Stack>
        </Container>
      </Stack>

      <Divider orientation="vertical" />

      <Stack grow style={{ minWidth: 0 }}>
        <TopBar
          breadcrumb={breadcrumb}
          context={context}
          onCommand={onCommand}
          onContextChange={onContextChange}
          walletSlot={walletSlot}
        />
        <Container
          grow
          overflow="auto"
          padding={["300", "350"]}
          position="relative"
        >
          {children}
        </Container>
      </Stack>
    </Surface>
  );
}
