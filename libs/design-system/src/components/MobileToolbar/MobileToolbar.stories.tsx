import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "../Button/Button";
import { MobileToolbar } from "./MobileToolbar";

const meta: Meta<typeof MobileToolbar> = {
  title: "DesignSystem/MobileToolbar",
  component: MobileToolbar,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    leading: <Button aria-label="Menu" icon="menu" intent="ghost" size="sm" />,
    actions: (
      <>
        <Button aria-label="Pin" icon="pin" intent="ghost" size="sm" />
        <Button aria-label="New task" icon="plus" intent="primary" size="sm" />
        <Button aria-label="Notifications" icon="bell" intent="ghost" size="sm" />
      </>
    ),
  },
};
export default meta;

export const Playground: StoryObj<typeof MobileToolbar> = {};
