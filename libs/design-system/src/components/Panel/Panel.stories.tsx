import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "../Container/Container";
import { Icon } from "../Icon/Icon";
import { Typography } from "../Typography/Typography";
import { Panel } from "./Panel";

const meta: Meta<typeof Panel> = {
  title: "DesignSystem/Panel",
  component: Panel,
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Panel>;

const Label = ({ children }: { children: string }) => (
  <Typography mono uppercase size="2xs" tracking="wide" type="note" variant="secondary">
    {children}
  </Typography>
);

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <Panel
        header={
          <>
            <Icon name="pulse" size="sm" tone="accent" />
            <Label>live log</Label>
          </>
        }
        headerEnd={
          <Typography mono size="2xs" type="note" variant="tertiary">
            128 lines
          </Typography>
        }
        padding="200"
      >
        <Typography mono size="xs" type="note" variant="secondary">
          streaming output…
        </Typography>
      </Panel>

      <Panel padding="200">
        <Container>
          <Typography type="text">A header-less framed panel.</Typography>
        </Container>
      </Panel>
    </div>
  ),
};

export const Playground: Story = {
  args: {
    header: <Label>panel</Label>,
    headerEnd: <Label>meta</Label>,
    padding: "200",
    children: "Body content",
  },
};
