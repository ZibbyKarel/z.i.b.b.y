import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Accordion } from "./Accordion";

const meta: Meta<typeof Accordion> = {
  title: "Components/Accordion",
  component: Accordion,
  parameters: { backgrounds: { default: "velin" } },
};
export default meta;

type Story = StoryObj<typeof Accordion>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 w-96">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          multi-expand
        </Typography>
        <Accordion
          sections={[
            {
              title: "Konfigurace agenta",
              content: "Nastavení modelu, limitů a kontextu spuštění.",
            },
            {
              title: "Vstupní schéma",
              content: "Definice JSON vstupního payloadu agenta.",
            },
            {
              title: "Výstupní schéma",
              content: "Defaultně rozbaleno.",
              defaultExpanded: true,
            },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          single — only one open at a time
        </Typography>
        <Accordion
          single
          sections={[
            {
              title: "Sekce A",
              content: "Pouze jedna sekce může být otevřena najednou.",
            },
            {
              title: "Sekce B",
              content: "Otevřením této sekce se zavře předchozí.",
            },
            { title: "Sekce C", content: "Obsah sekce C." },
          ]}
        />
      </div>
    </div>
  ),
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
