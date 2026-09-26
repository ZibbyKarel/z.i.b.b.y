import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./AppHeader";
import { Tab, TabList, Tabs } from "../Tabs/Tabs";
import { LimitBar } from "../LimitBar/LimitBar";
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
      <AppHeader nav={nav} onSearchClick={() => {}} settingsHref="/settings" />
      <AppHeader
        activeCount={<Typography type="labelSm">6 active</Typography>}
        limits={
          <div className="flex gap-4">
            <LimitBar label="5H" max={100} value={40} />
            <LimitBar label="WEEK" max={100} value={62} />
          </div>
        }
        nav={nav}
        onSearchClick={() => {}}
        operator={<Typography type="labelSm">Karel</Typography>}
        settingsHref="/settings"
      />
    </div>
  ),
};

export const Playground: Story = {
  args: { nav, onSearchClick: () => {}, settingsHref: "/settings" },
};
