import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import type { ContextName } from "../../DesignSystemContext/contextTokens";
import { TopBar } from "./TopBar";

/** A neutral stand-in for the app-injected wallet/limits widget. */
const walletSlot = (
  <div className="rounded border border-border px-3 py-1.5 font-mono text-sm text-foreground-dim">
    wallet slot
  </div>
);

const meta: Meta<typeof TopBar> = {
  title: "Dashboard/TopBar",
  component: TopBar,
  parameters: { backgrounds: { default: "velin" }, layout: "fullscreen" },
};
export default meta;

type Story = StoryObj<typeof TopBar>;

export const Default: Story = {
  render: () => {
    const [ctx, setCtx] = useState<ContextName>("home");
    return (
      <TopBar
        context={ctx}
        onContextChange={setCtx}
        breadcrumb="Přehled"
        walletSlot={walletSlot}
      />
    );
  },
};
