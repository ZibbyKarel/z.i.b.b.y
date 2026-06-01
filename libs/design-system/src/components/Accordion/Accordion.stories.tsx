import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Accordion, AccordionItem } from "./Accordion";

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
          multi-expand (default)
        </Typography>
        <Accordion>
          <AccordionItem summary="Konfigurace agenta">
            Nastavení modelu, limitů a kontextu spuštění.
          </AccordionItem>
          <AccordionItem summary="Vstupní schéma">
            Definice JSON vstupního payloadu agenta.
          </AccordionItem>
          <AccordionItem summary="Výstupní schéma" defaultExpanded>
            Defaultně rozbaleno.
          </AccordionItem>
        </Accordion>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          single — only one open at a time
        </Typography>
        <Accordion single>
          <AccordionItem summary="Sekce A">
            Pouze jedna sekce může být otevřena najednou.
          </AccordionItem>
          <AccordionItem summary="Sekce B">
            Otevřením této sekce se zavře předchozí.
          </AccordionItem>
          <AccordionItem summary="Sekce C">Obsah sekce C.</AccordionItem>
        </Accordion>
      </div>
    </div>
  ),
};

export const Playground: Story = {
  args: {
    single: false,
  },
  render: ({ single }) => (
    <Accordion single={single}>
      <AccordionItem summary="Položka A">Obsah položky A</AccordionItem>
      <AccordionItem summary="Položka B">Obsah položky B</AccordionItem>
    </Accordion>
  ),
};
