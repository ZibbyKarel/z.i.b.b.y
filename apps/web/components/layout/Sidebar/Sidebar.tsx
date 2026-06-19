import Link from "next/link";
import {
  Container,
  Divider,
  List,
  ListItem,
  ListItemBadge,
  ListItemIcon,
  ListItemText,
  Spacer,
  Stack,
} from "@zibby/design-system";
import type { NavItem } from "@zibby/design-system";

export interface SidebarProps {
  navItems: NavItem[];
  activeNav: string;
  footerItem?: NavItem;
}

export function Sidebar({ navItems, activeNav, footerItem }: SidebarProps) {
  return (
    <Stack grow style={{ minHeight: 0 }}>
      <List>
        {navItems.map((item) => (
          <Link href={item.href ?? "/"} key={item.id} style={{ display: "block" }}>
            <ListItem active={item.id === activeNav}>
              <ListItemIcon glyph={item.glyph} />
              <ListItemText>{item.label}</ListItemText>
              {item.badge ? (
                <ListItemBadge aria-label={item.badgeLabel}>{item.badge}</ListItemBadge>
              ) : null}
            </ListItem>
          </Link>
        ))}
      </List>
      {footerItem && (
        <>
          <Spacer />
          <Container>
            <Divider />
            <Container padding={["75", "0", "0", "0"]}>
              {}
              <Link href={footerItem.href ?? "/"} style={{ display: "block" }}>
                <ListItem active={footerItem.id === activeNav}>
                  <ListItemIcon glyph={footerItem.glyph} />
                  <ListItemText>{footerItem.label}</ListItemText>
                </ListItem>
              </Link>
            </Container>
          </Container>
        </>
      )}
    </Stack>
  );
}
