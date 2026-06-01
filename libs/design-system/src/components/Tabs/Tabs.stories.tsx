import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabList, Tab, TabPanel } from "./Tabs";

const meta: Meta<typeof Tabs> = {
  title: "Components/Tabs",
  component: Tabs,
  parameters: { backgrounds: { default: "velin" } },
  args: { defaultValue: "overview" },
};
export default meta;

type Story = StoryObj<typeof Tabs>;

export const Overview: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabList>
        <Tab value="overview">Přehled</Tab>
        <Tab value="agents">Agenti</Tab>
        <Tab value="logs">Logy</Tab>
      </TabList>
      <TabPanel value="overview">
        <div className="p-4 text-sm text-foreground-dim">Obsah přehledu</div>
      </TabPanel>
      <TabPanel value="agents">
        <div className="p-4 text-sm text-foreground-dim">Seznam agentů</div>
      </TabPanel>
      <TabPanel value="logs">
        <div className="p-4 text-sm text-foreground-dim">Záznamy aktivit</div>
      </TabPanel>
    </Tabs>
  ),
};

export const Playground: Story = {
  render: () => (
    <Tabs defaultValue="a">
      <TabList>
        <Tab value="a">Tab A</Tab>
        <Tab value="b">Tab B</Tab>
        <Tab value="c">Tab C</Tab>
      </TabList>
      <TabPanel value="a"><div className="p-4">Panel A</div></TabPanel>
      <TabPanel value="b"><div className="p-4">Panel B</div></TabPanel>
      <TabPanel value="c"><div className="p-4">Panel C</div></TabPanel>
    </Tabs>
  ),
};
