import type { Meta, StoryObj } from "@storybook/react";
import { Dialog, DialogBody } from "./Dialog";
import { Button } from "../Button/Button";

const meta: Meta<typeof Dialog> = {
  title: "DesignSystem/Dialog",
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

export const Overview: Story = {
  render: () => (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost">Zrušit</Button>
          <Button icon="x" intent="danger">
            Smazat
          </Button>
        </>
      }
      description="Pipeline a veškerá jeho data budou trvale odstraněna."
      title="Smazat pipeline"
    >
      <DialogBody>
        <p>Agent zpracovává 3 fronty a čeká na schválení.</p>
      </DialogBody>
    </Dialog>
  ),
};

export const FullCanvas: Story = {
  name: "Full (canvas)",
  render: () => (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost">Zrušit</Button>
          <Button icon="plus" intent="primary">
            Vytvořit
          </Button>
        </>
      }
      title="Editor pipeline"
      width="full"
    >
      <DialogBody>
        <p>Near-viewport modal — hosts a scrollable canvas in a flex-1 body.</p>
      </DialogBody>
    </Dialog>
  ),
};

export const Fullscreen: Story = {
  name: "Fullscreen",
  render: () => (
    <Dialog
      fullscreen
      open
      actions={
        <>
          <Button intent="ghost">Zrušit</Button>
          <Button icon="collapse" intent="primary">
            Zmenšit
          </Button>
        </>
      }
      title="Editor pipeline"
      width="full"
    >
      <DialogBody>
        <p>Fills the viewport (minus margins) — overrides `width` for max working area.</p>
      </DialogBody>
    </Dialog>
  ),
};

export const Playground: Story = {};
