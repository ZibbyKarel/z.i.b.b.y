import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./AppHeader";
import { Button } from "../Button/Button";
import { Tab, TabList, Tabs } from "../Tabs/Tabs";
import { LimitBar } from "../LimitBar/LimitBar";
import { MenuButton } from "../MenuButton/MenuButton";
import { Typography } from "../Typography/Typography";

const nav = (
  <Tabs value="org" variant="mono">
    <TabList>
      <Tab value="org">Org</Tab>
      <Tab value="work">Work</Tab>
      <Tab value="activity">Activity</Tab>
      <Tab value="policy">Policy</Tab>
    </TabList>
  </Tabs>
);

const overflowMenu = (
  <MenuButton
    ariaLabel="More"
    items={[
      { id: "pin", label: "Pin page", trailing: "+", onSelect: () => {} },
      { id: "d1", divider: true },
      { id: "settings", label: "Settings", trailing: "⚙", href: "/system/settings" },
      { id: "registries", label: "Registries", trailing: "→", href: "/system/registries" },
    ]}
    variant="bordered"
  />
);

const meta: Meta<typeof AppHeader> = {
  title: "DesignSystem/AppHeader",
  component: AppHeader,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof AppHeader>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <AppHeader homeHref="/org" nav={nav} onSearchClick={() => {}} />
      <AppHeader
        activeCount={<Typography type="labelSm">6 active</Typography>}
        homeHref="/org"
        limits={
          <div className="flex gap-4">
            <LimitBar label="5H" max={100} value={40} />
            <LimitBar label="WEEK" max={100} value={62} />
          </div>
        }
        menu={overflowMenu}
        nav={nav}
        onSearchClick={() => {}}
        operator={<Typography type="labelSm">Karel</Typography>}
        pin={<Button aria-label="Pin this page" icon="pin" intent="ghost" size="sm" />}
      />
    </div>
  ),
};

export const Playground: Story = {
  args: { homeHref: "/org", menu: overflowMenu, nav, onSearchClick: () => {} },
};
