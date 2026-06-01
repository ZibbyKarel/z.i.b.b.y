import type { Meta, StoryObj } from "@storybook/react";
import { Dialog, DialogBody } from "./Dialog";
import { Button } from "../Button/Button";

const meta: Meta<typeof Dialog> = {
  title: "Components/Dialog",
  component: Dialog,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    open: true,
    title: "Potvrzení",
    description: "Tuto akci nelze vrátit.",
    children: "Opravdu chcete pokračovat?",
  },
};
export default meta;

type Story = StoryObj<typeof Dialog>;

export const Default: Story = {};

export const WithActions: Story = {
  args: {
    title: "Smazat pipeline",
    description: "Pipeline a veškerá jeho data budou trvale odstraněna.",
    actions: (
      <>
        <Button intent="ghost">Zrušit</Button>
        <Button intent="reject" icon="x">Smazat</Button>
      </>
    ),
    children: undefined,
  },
};

export const WithBody: Story = {
  render: () => (
    <Dialog open title="Detail agenta">
      <DialogBody>
        <p>Agent zpracovává 3 fronty a čeká na schválení.</p>
      </DialogBody>
    </Dialog>
  ),
};

export const Playground: Story = {};
