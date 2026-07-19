import type { Meta, StoryObj } from "@storybook/react";
import { Container, type NavItem } from "@zibby/design-system";
import { Sidebar } from "./Sidebar";

const navItems: NavItem[] = [
  { id: "home", glyph: "flow", href: "/chat", label: "Přehled" },
  { id: "skills", glyph: "spark", href: "/skills", label: "Skilly" },
  { id: "agents", glyph: "bot", href: "/agents", label: "Agenti", badge: 3 },
  { id: "integrations", glyph: "plug", href: "/integrations", label: "Integrace" },
];

const footerItem: NavItem = {
  id: "settings",
  glyph: "bot",
  href: "/settings",
  label: "Nastavení",
};

const meta: Meta<typeof Sidebar> = {
  title: "Dashboard/Layout/Sidebar",
  component: Sidebar,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <Container
        height="420px"
        padding={["300", "150"]}
        style={{ background: "var(--color-background)", display: "flex" }}
        width="224px"
      >
        <Story />
      </Container>
    ),
  ],
  args: { navItems, footerItem, activeNav: "home" },
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};
