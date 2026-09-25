import type { Meta, StoryObj } from "@storybook/react";
import { AppFrame } from "./AppFrame";
import { AppHeader } from "../AppHeader/AppHeader";
import { ChatDock } from "../ChatDock/ChatDock";
import { Rail } from "../Rail/Rail";
import { SubNav } from "../SubNav/SubNav";
import { Tab, TabList, Tabs } from "../Tabs/Tabs";
import { Typography } from "../Typography/Typography";

const header = (
  <AppHeader
    nav={
      <Tabs value="org" variant="mono">
        <TabList>
          <Tab value="org">Org</Tab>
          <Tab value="work">Work</Tab>
          <Tab value="activity">Activity</Tab>
        </TabList>
      </Tabs>
    }
    onSearchClick={() => {}}
    settingsHref="/settings"
  />
);

const subnav = (
  <SubNav
    items={[
      { href: "/dev/overview", label: "Overview", active: true },
      { href: "/dev/team", label: "Team" },
      { href: "/dev/pipelines", label: "Pipelines" },
    ]}
  />
);

const rail = (
  <Rail count={1}>
    <div className="border border-line-2 bg-background p-3">
      <Typography type="bodySm">Kevin wants to push to main.</Typography>
    </div>
  </Rail>
);

const composer = (
  <input
    aria-label="Message"
    className="h-8 w-full border border-line-2 bg-background px-2.5 text-[13px] outline-none"
    placeholder="Ask Zibby…"
  />
);

const meta: Meta<typeof AppFrame> = {
  title: "DesignSystem/AppFrame",
  component: AppFrame,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof AppFrame>;

export const Overview: Story = {
  render: () => (
    <div className="h-[720px] w-full">
      <AppFrame dock={<ChatDock composer={composer} />} header={header} rail={rail} subnav={subnav}>
        <div className="p-6">
          <Typography type="h2">Department: Dev</Typography>
        </div>
      </AppFrame>
    </div>
  ),
};

export const Playground: Story = {
  render: () => (
    <div className="h-[720px] w-full">
      <AppFrame dock={<ChatDock composer={composer} />} header={header} rail={rail} subnav={subnav}>
        <div className="p-6">
          <Typography type="h2">Department: Dev</Typography>
        </div>
      </AppFrame>
    </div>
  ),
};
