import type { Meta, StoryObj } from "@storybook/react";
import { Container } from "@zibby/design-system";
import { CatalogProvider } from "../../../state/store";
import { RightRail } from "./RightRail";

const meta: Meta<typeof RightRail> = {
  title: "Dashboard/Layout/RightRail",
  component: RightRail,
  parameters: { backgrounds: { default: "velin" } },
  decorators: [
    (Story) => (
      <CatalogProvider>
        <Container width="340px">
          <Story />
        </Container>
      </CatalogProvider>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof RightRail>;

// No live API in Storybook — the queries stay pending, so each panel renders its
// empty/fallback state.
export const Default: Story = {};
