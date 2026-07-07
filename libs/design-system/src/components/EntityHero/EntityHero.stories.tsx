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
      <div className="flex flex-col gap-2">
        <div className="w-[420px]">
          {/* `children` overlay — the avatar becomes a stretched background behind
              arbitrary content (the band grows to fit it). */}
          <EntityHero glyph="flow" image={PLACEHOLDER_IMAGE}>
            <div className="p-4 font-mono text-foreground">
              <div className="text-lg font-bold">delivery_42</div>
              <div className="text-sm text-foreground-dim">běží · pipelina · agent delivery</div>
            </div>
          </EntityHero>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="w-[620px]">
          {/* Phase 60: `imageBleed="band"` — used only by the run-detail header. The
              image is constrained to a right-anchored bounded strip with a horizontal
              fade, instead of stretching full-bleed, so header content on the left
              sits over plain surface. */}
          <EntityHero glyph="flow" image={PLACEHOLDER_IMAGE} imageBleed="band">
            <div className="p-4 font-mono text-foreground">
              <div className="text-lg font-bold">delivery_42</div>
              <div className="text-sm text-foreground-dim">běží · pipelina · agent delivery</div>
            </div>
          </EntityHero>
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
