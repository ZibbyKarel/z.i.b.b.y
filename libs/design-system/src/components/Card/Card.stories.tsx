import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Card, CardActions, CardContent, CardFooter, CardHeader } from "./Card";
import { Button } from "../Button/Button";

const meta: Meta<typeof Card> = {
  title: "DesignSystem/Card",
  component: Card,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "Obsah karty" },
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-80">
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          basic
        </Typography>
        <Card>Základní karta bez struktury</Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          header + content
        </Typography>
        <Card>
          <CardHeader>{"// Statistiky"}</CardHeader>
          <CardContent>Obsah sekce s hlavičkou</CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          header + content + footer
        </Typography>
        <Card>
          <CardHeader>{"// Nastavení"}</CardHeader>
          <CardContent>Hlavní obsah karty.</CardContent>
          <CardFooter>Zápatí s doplňkovými informacemi</CardFooter>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          with actions
        </Typography>
        <Card>
          <CardHeader>Potvrzení</CardHeader>
          <CardContent>Opravdu chcete smazat tento pipeline?</CardContent>
          <CardActions>
            <Button intent="ghost">Zrušit</Button>
            <Button icon="x" intent="danger">
              Smazat
            </Button>
          </CardActions>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography mono type="subtitle" variant="tertiary">
          corners (HUD style)
        </Typography>
        <Card corners>
          <CardContent>Karta s HUD rohovými závorkami</CardContent>
        </Card>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
