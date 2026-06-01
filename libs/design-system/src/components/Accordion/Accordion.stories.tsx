import type { Meta, StoryObj } from "@storybook/react";
import { Accordion } from "./Accordion";

const meta: Meta<typeof Accordion> = {
  title: "Components/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Accordion>;

export const Default: Story = {
  args: {
    sections: [
      { title: "Konfigurace agenta", content: "Nastavení modelu, limitů a kontextu spuštění." },
      { title: "Vstupní schéma", content: "Definice JSON vstupního payloadu agenta." },
      { title: "Výstupní schéma", content: "Definice struktury výstupu, defaultně rozbaleno.", defaultExpanded: true },
    ],
  },
};

export const Single: Story = {
  args: {
    single: true,
    sections: [
      { title: "Sekce A", content: "Pouze jedna sekce může být otevřena najednou." },
      { title: "Sekce B", content: "Otevřením této sekce se zavře předchozí." },
      { title: "Sekce C", content: "Obsah sekce C." },
    ],
  },
};

export const Playground: Story = {
  args: {
    single: false,
    sections: [
      { title: "Položka A", content: "Obsah položky A" },
      { title: "Položka B", content: "Obsah položky B" },
    ],
  },
};
