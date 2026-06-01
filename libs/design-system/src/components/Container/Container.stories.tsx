import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "./Container";

const meta: Meta<typeof Container> = {
  title: "Primitives/Container",
  component: Container,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "Obsah kontejneru", padding: "200" },
};
export default meta;

type Story = StoryObj<typeof Container>;

export const Default: Story = {
  render: () => (
    <Container padding="200" style={{ border: "1px solid var(--color-border)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--color-foreground-dim)" }}>
      padding="200" (16px)
    </Container>
  ),
};

export const PaddingScale: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      {(["100", "150", "200", "250", "300"] as const).map((p) => (
        <Container key={p} padding={p} style={{ border: "1px solid var(--color-border)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--color-foreground-dim)" }}>
          padding="{p}"
        </Container>
      ))}
    </div>
  ),
};

export const AsProp: Story = {
  render: () => (
    <Container as="section" padding="150" style={{ border: "1px solid var(--color-border)", fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--color-foreground-dim)" }}>
      as="section"
    </Container>
  ),
};

export const Playground: Story = {};
