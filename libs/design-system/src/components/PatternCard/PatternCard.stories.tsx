import type { Meta, StoryObj } from "@storybook/react";
import { PatternCard } from "./PatternCard";

const meta: Meta<typeof PatternCard> = {
  title: "DesignSystem/PatternCard",
  component: PatternCard,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    scope: "API · PROPOSED",
    rule: "Run `pnpm exec eslint --fix` before every push to `fix/*`.",
    evidence: ["done", "error"],
    evidenceLabel: "1 / 2",
  },
};
export default meta;

type Story = StoryObj<typeof PatternCard>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-4 p-12" style={{ maxWidth: 560 }}>
      <PatternCard
        evidence={["done", "error"]}
        evidenceLabel="1 / 2"
        onAccept={() => {}}
        onDismiss={() => {}}
        rule="Run `pnpm exec eslint --fix` before every push to `fix/*`."
        scope="API · PROPOSED"
      />
      <PatternCard
        evidence={["done", "done"]}
        evidenceLabel="NOW A RULE"
        rule="Rule accepted."
        scope="API · ACTIVE"
      />
    </div>
  ),
};

export const Playground: Story = { args: { onAccept: () => {}, onDismiss: () => {} } };
