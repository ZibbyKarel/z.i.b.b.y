import type { Meta, StoryObj } from "@storybook/react";
import { EntityHero } from "./EntityHero";

// A tiny valid 1x1 transparent PNG — stands in for an uploaded avatar.
const PLACEHOLDER_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const meta: Meta<typeof EntityHero> = {
  title: "DesignSystem/EntityHero",
  component: EntityHero,
  parameters: { backgrounds: { default: "velin" } },
  args: {
    glyph: "compass",
    name: "Architekt",
    desc: "Plans the delivery loop before a single line of code is written.",
  },
};
export default meta;

type Story = StoryObj<typeof EntityHero>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="w-[420px]">
          <EntityHero
            desc="Plans the delivery loop before a single line of code is written."
            glyph="compass"
            image={PLACEHOLDER_IMAGE}
            name="Architekt"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="w-[420px]">
          <EntityHero desc="No avatar uploaded yet." glyph="bot" name="Kodér" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="w-[420px]">
          <EntityHero editable glyph="flask" name="Tester" onUpload={() => {}} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="w-[420px]">
          <EntityHero fit="contain" glyph="flow" image={PLACEHOLDER_IMAGE} name="Delivery Pipeline" />
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
