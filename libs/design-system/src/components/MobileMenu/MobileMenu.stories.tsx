import type { Meta, StoryObj } from "@storybook/react";
import { MobileMenu } from "./MobileMenu";

const meta: Meta<typeof MobileMenu> = {
  title: "DesignSystem/MobileMenu",
  component: MobileMenu,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    sections: [
      {
        id: "work",
        label: "Work",
        href: "/work",
        active: true,
        items: [
          { href: "/work/tasks", label: "Tasks", active: true },
          { href: "/work/runs", label: "Runs" },
        ],
      },
      {
        id: "system",
        label: "System",
        href: "/system",
        items: [{ href: "/system/a", label: "A" }],
      },
      { id: "home", label: "Home", href: "/home", items: [] },
    ],
  },
};
export default meta;

export const Playground: StoryObj<typeof MobileMenu> = {};
