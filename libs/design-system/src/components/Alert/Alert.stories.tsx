import type { Meta, StoryObj } from "@storybook/react";
import { Typography } from "../Typography/Typography";
import { Alert } from "./Alert";

const meta: Meta<typeof Alert> = {
  title: "Components/Alert",
  component: Alert,
  parameters: { backgrounds: { default: "velin" } },
  args: { children: "Toto je informační zpráva.", severity: "info" },
};
export default meta;

type Story = StoryObj<typeof Alert>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6 w-96">
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          severities
        </Typography>
        <div className="flex flex-col gap-3">
          <Alert severity="info" title="Info">
            Pipeline byl naplánován.
          </Alert>
          <Alert severity="ok" title="Hotovo">
            Skill byl úspěšně nasazen.
          </Alert>
          <Alert severity="warn" title="Varování">
            Limit tokenů se blíží.
          </Alert>
          <Alert severity="error" title="Chyba">
            Nasazení selhalo.
          </Alert>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Typography type="subtitle" variant="tertiary" mono>
          with close
        </Typography>
        <Alert severity="warn" title="Zavíratelný" onClose={() => undefined}>
          Kvóta je z 80 % vyčerpána.
        </Alert>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
