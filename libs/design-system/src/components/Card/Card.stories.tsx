import type { Meta, StoryObj } from "@storybook/react";
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

export const Default: Story = {};

export const WithHeader: Story = {
  render: () => (
    <Card header="// Statistiky">
      <CardContent>Obsah sekce</CardContent>
    </Card>
  ),
};

export const WithHeaderAndFooter: Story = {
  render: () => (
    <Card>
      <CardHeader>// Nastavení</CardHeader>
      <CardContent>Hlavní obsah karty s libovolným obsahem.</CardContent>
      <CardFooter>Zápatí s doplňkovými informacemi</CardFooter>
    </Card>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Card>
      <CardHeader>Potvrzení</CardHeader>
      <CardContent>Opravdu chcete smazat tento pipeline?</CardContent>
      <CardActions>
        <Button intent="ghost">Zrušit</Button>
        <Button intent="reject" icon="x">Smazat</Button>
      </CardActions>
    </Card>
  ),
};

export const WithCorners: Story = {
  render: () => (
    <Card corners>
      <CardContent>Karta s HUD rohovými závorkami</CardContent>
    </Card>
  ),
};

export const Playground: Story = {};
