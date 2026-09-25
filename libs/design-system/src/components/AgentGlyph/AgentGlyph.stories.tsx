import type { Meta, StoryObj } from "@storybook/react";
import { STATE_ORDER } from "../../stateTone";
import { Typography } from "../Typography/Typography";
import { AgentGlyph, type GlyphSize } from "./AgentGlyph";

const meta: Meta<typeof AgentGlyph> = {
  title: "DesignSystem/AgentGlyph",
  component: AgentGlyph,
  parameters: { backgrounds: { default: "velin" } },
  args: { seed: "Kevin", state: "working", size: 48, glow: true },
};
export default meta;

type Story = StoryObj<typeof AgentGlyph>;

const SEEDS = ["Kevin", "Stuart", "Bob", "Jerry", "Otto"];
const SIZES: GlyphSize[] = [18, 22, 30, 48, 128];

/** One state row against a given theme — the "Directions" grid cell (ZA-03
 *  verification: 6 states × light/dark, checked against `ZibbyCorp Directions.dc.html`).
 *  `data-theme` re-scopes every `--color-*`/`--gw` var for its subtree (`globals.css`'s
 *  `[data-theme="light"|"dark"]` blocks), so the glow (dark-only) and colours are the
 *  real per-theme render, not a simulation. */
function DirectionsRow({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className="rounded-lg border border-border bg-background p-6" data-theme={theme}>
      <div className="flex items-center gap-6">
        {STATE_ORDER.map((state) => (
          <div className="flex flex-col items-center gap-2" key={state}>
            <AgentGlyph seed="Kevin" size={48} state={state} />
            <Typography type="micro">{state}</Typography>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Overview: Story = {
  render: () => (
    <div className="flex flex-col gap-8 p-12">
      <div className="flex flex-col gap-3">
        <Typography type="label">Directions grid — 6 states × light/dark</Typography>
        <div className="flex flex-col gap-4">
          <DirectionsRow theme="dark" />
          <DirectionsRow theme="light" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">every sanctioned size, one state</Typography>
        <div className="flex items-end gap-6">
          {SIZES.map((size) => (
            <div className="flex flex-col items-center gap-2" key={size}>
              <AgentGlyph seed="Kevin" size={size} state="working" />
              <Typography type="micro">{size}px</Typography>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Typography type="label">deterministic per seed — five agents, one state</Typography>
        <div className="flex items-center gap-6">
          {SEEDS.map((seed) => (
            <div className="flex flex-col items-center gap-2" key={seed}>
              <AgentGlyph seed={seed} size={48} state="thinking" />
              <Typography type="micro">{seed}</Typography>
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};

export const Playground: Story = {};
