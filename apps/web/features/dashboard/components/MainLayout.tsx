import type { ReactNode } from "react";
import {
  Container,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemBadge,
  ListTestId,
  Stack,
  Surface,
} from "@zibby/design-system";
import type { NavItem, LinkComponentType } from "@zibby/design-system";
import type { ContextName } from "../../../domain";
import { TopBar } from "./TopBar";
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
  return (
    <Surface grid scanlines>
      <Stack
        as="nav"
        aria-label="Main navigation"
        shrink={false}
        style={{ width: 224, backgroundColor: "var(--color-background)" }}
      >
        <Container
          padding={["300", "150"]}
          grow
          style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
        >
          <BrandLogo />
          <Stack grow style={{ minHeight: 0 }}>
            <List>
              {navItems.map((item) => (
                <ListItem
                  key={item.id}
                  active={item.id === activeNav}
                  onSelect={() => onNavigate(item.id)}
                  href={item.href}
                  linkComponent={linkComponent}
                  data-testid={`${ListTestId.Item}-${item.id}`}
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
                    onSelect={() => onNavigate(footerItem.id)}
                    href={footerItem.href}
                    linkComponent={linkComponent}
                    data-testid={`${ListTestId.Item}-${footerItem.id}`}
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
          context={context}
          onContextChange={onContextChange}
          breadcrumb={breadcrumb}
          walletSlot={walletSlot}
          onCommand={onCommand}
        />
        <Container
          position="relative"
          grow
          overflow="auto"
          padding={["300", "350"]}
        >
          {children}
        </Container>
      </Stack>
    </Surface>
  );
}
