import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Card, CardHeader, CardContent, CardFooter, CardActions } from "./Card";
import { Button } from "../Button/Button";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
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
        <Typography type="subtitle" variant="tertiary" mono>
          basic
        </Typography>
        <Card>Základní karta bez struktury</Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          header + content
        </Typography>
        <Card>
          <CardHeader>// Statistiky</CardHeader>
          <CardContent>Obsah sekce s hlavičkou</CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          header + content + footer
        </Typography>
        <Card>
          <CardHeader>// Nastavení</CardHeader>
          <CardContent>Hlavní obsah karty.</CardContent>
          <CardFooter>Zápatí s doplňkovými informacemi</CardFooter>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          with actions
        </Typography>
        <Card>
          <CardHeader>Potvrzení</CardHeader>
          <CardContent>Opravdu chcete smazat tento pipeline?</CardContent>
          <CardActions>
            <Button intent="ghost">Zrušit</Button>
            <Button intent="reject" icon="x">
              Smazat
            </Button>
          </CardActions>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
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
