import type { Meta, StoryObj } from "@storybook/react";
import { DetailTable } from "../DetailTable/DetailTable";
import { NeedsYouCard } from "../NeedsYouCard/NeedsYouCard";
import { StackCrumbs } from "../StackCrumbs/StackCrumbs";
import { StatCell, StatCellGrid } from "../StatCell/StatCell";
import { AnchoredSheet } from "./AnchoredSheet";
import { SheetAction, SheetBlock, SheetSection, SheetText } from "./SheetParts";

const meta: Meta<typeof AnchoredSheet> = {
  title: "DesignSystem/AnchoredSheet",
  component: AnchoredSheet,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="relative h-[640px] w-full">{Story()}</div>],
  args: {
    kind: "PULL REQUEST · #214",
    stateLabel: "CHANGES REQUESTED",
    hint: "J / K · ESC",
    title: "Add retry budget to the runner",
    chips: ["ZIBBY/API", "FEAT → MAIN", "BY YOU"],
    tone: "blocked",
    closeLabel: "Close",
    onClose: () => {},
    left: 520,
    width: 560,
    top: 0,
    height: 640,
    eraserLeft: -2,
    eraserTop: 40,
    eraserHeight: 34,
  },
};
export default meta;
type Story = StoryObj<typeof AnchoredSheet>;

const body = (
  <>
    <NeedsYouCard
      approveLabel="APPROVE"
      denyLabel="DENY"
      diff={["@@ -1,2 +1,2 @@", "-retries: 1", "+retries: 3"]}
      heading="NEEDS YOU · PUSH"
      onApprove={() => {}}
      onDeny={() => {}}
      text="Push the branch to origin?"
      wait="WAITING 2H"
    />
    <StatCellGrid>
      <StatCell label="REVIEW" tone="blocked" value="CHANGES REQUESTED" />
      <StatCell label="CHECKS" tone="working" value="4 / 4" />
      <StatCell label="CHANGES" tone="faint" value="+120 −14" />
    </StatCellGrid>
    <StackCrumbs
      crumbs={[
        { id: "1", label: "#212", tone: "done" },
        { id: "2", label: "#214", tone: "blocked", current: true },
      ]}
      label="STACK"
    />
    <SheetSection>
      <SheetBlock label="DESCRIPTION">
        <SheetText lines={["Adds a bounded retry budget so a flaky step cannot loop forever."]} />
      </SheetBlock>
      <SheetBlock label="DETAILS">
        <DetailTable rows={[{ cells: ["EPIC", "ZB-12 · Runner"] }, { cells: ["TEAM", "Core"] }]} />
      </SheetBlock>
    </SheetSection>
  </>
);

export const Overview: Story = {
  render: (args) => (
    <AnchoredSheet
      {...args}
      footerEnd={<SheetAction intent="primary">MERGE</SheetAction>}
      footerNote="NEEDS APPROVAL"
      footerStart={<SheetAction href="https://github.com">OPEN ON GITHUB ↗</SheetAction>}
    >
      {body}
    </AnchoredSheet>
  ),
};

export const Playground: Story = {
  render: (args) => <AnchoredSheet {...args}>{body}</AnchoredSheet>,
};
