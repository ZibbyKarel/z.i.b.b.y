import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "../../components/Icon/Icon";

import { ImmersiveShell } from "./ImmersiveShell";

const meta: Meta<typeof ImmersiveShell> = {
  title: "Immersive/ImmersiveShell",
  component: ImmersiveShell,
};
export default meta;

type Story = StoryObj<typeof ImmersiveShell>;

const BackButton = () => (
  <a aria-label="Zpět" className="flex size-full items-center justify-center text-accent" href="#">
    <Icon className="rotate-180" name="arrow" size="sm" />
  </a>
);

export const Overview: Story = {
  render: () => (
    <ImmersiveShell
      actions={
        <button className="text-sm text-foreground-dim" type="button">
          Filtrovat
        </button>
      }
      backSlot={<BackButton />}
      subtitle="Vše, co ZIBBY dokončil napříč subsystémy"
      title="Archiv úloh"
    >
      <div className="p-6 text-foreground-dim">obsah stránky</div>
    </ImmersiveShell>
  ),
};

export const Playground: Story = {
  args: {
    title: "Archiv úloh",
    subtitle: "Vše, co ZIBBY dokončil napříč subsystémy",
    backSlot: <BackButton />,
    children: <div className="p-6 text-foreground-dim">obsah stránky</div>,
  },
};
