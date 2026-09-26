import type { Meta, StoryObj } from "@storybook/react";
import { DiffView } from "./DiffView";

const UNIFIED = [
  "--- a/apps/api/src/health.ts",
  "+++ b/apps/api/src/health.ts",
  "@@ -12,6 +12,8 @@",
  " export function health() {",
  "-  return { status: 'ok' };",
  "+  return { status: 'ok', version };",
  " }",
].join("\n");

const meta: Meta<typeof DiffView> = {
  title: "DesignSystem/DiffView",
  component: DiffView,
  args: {},
};
export default meta;

type Story = StoryObj<typeof DiffView>;

export const Overview: Story = {
  render: () => (
    <div className="max-w-2xl p-8">
      <DiffView stat={{ files: 1, additions: 1, deletions: 1 }} unified={UNIFIED} />
    </div>
  ),
};

export const Playground: Story = {
  args: { unified: UNIFIED, stat: { files: 1, additions: 1, deletions: 1 } },
};
