import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Container } from "./Container";

const meta: Meta<typeof Container> = {
  title: "Components/Container",
  component: Container,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "Obsah kontejneru", padding: "200" },
};
export default meta;

type Story = StoryObj<typeof Container>;

const boxStyle = {
  border: "1px solid var(--color-border)",
  fontFamily: "var(--font-mono)",
  fontSize: "0.875rem",
  color: "var(--color-foreground-dim)",
};

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          padding scale
        </Typography>
        <div className="flex flex-col gap-2">
          {(["100", "150", "200", "250", "300"] as const).map((p) => (
            <Container key={p} padding={p} style={boxStyle}>
              padding="{p}"
            </Container>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          as prop
        </Typography>
        <Container as="section" padding="150" style={boxStyle}>
          as="section"
        </Container>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
