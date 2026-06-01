import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Container,
  Divider,
  List,
  ListItem,
  ListItemBadge,
  ListItemIcon,
  ListItemText,
  ListTestId,
  Stack,
  Surface,
} from "@zibby/design-system";
import type { LinkComponentType, NavItem } from "@zibby/design-system";
import type { ContextName } from "../../domain";
import { TopBar } from "./TopBar/TopBar";
import { BrandLogo } from "./BrandLogo";

export interface MainLayoutProps {
  context: ContextName;
  onContextChange: (context: ContextName) => void;
  navItems: NavItem[];
  activeNav: string;
  onNavigate: (id: string) => void;
  footerItem?: NavItem;
  breadcrumb: string;
  walletSlot?: ReactNode;
  onCommand?: () => void;
  linkComponent?: LinkComponentType;
  children: ReactNode;
}

export function MainLayout({
  context,
  onContextChange,
  navItems,
  activeNav,
  onNavigate,
  footerItem,
  breadcrumb,
  walletSlot,
  onCommand,
  linkComponent,
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
                <ListItem
                  active={item.id === activeNav}
                  data-testid={`${ListTestId.Item}-${item.id}`}
                  href={item.href}
                  key={item.id}
                  linkComponent={linkComponent}
                  onSelect={() => onNavigate(item.id)}
                >
                  <ListItemIcon glyph={item.glyph} />
                  <ListItemText>{item.label}</ListItemText>
                  {item.badge ? (
                    <ListItemBadge data-testid={`${ListTestId.Badge}-${item.id}`}>
                      {item.badge}
                    </ListItemBadge>
                  ) : null}
                </ListItem>
              ))}
            </List>
            {footerItem && (
              <Container style={{ marginTop: "auto" }}>
                <Divider />
                <Container padding={["75", "0", "0", "0"]}>
                  <ListItem
                    active={footerItem.id === activeNav}
                    data-testid={`${ListTestId.Item}-${footerItem.id}`}
                    href={footerItem.href}
                    linkComponent={linkComponent}
                    onSelect={() => onNavigate(footerItem.id)}
                  >
                    <ListItemIcon glyph={footerItem.glyph} />
                    <ListItemText>{footerItem.label}</ListItemText>
                  </ListItem>
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
