import type { CSSProperties } from "react";

export const ACCENT = "rgba(91,141,239,1)";

export const radialGlow: CSSProperties = {
  background:
    "radial-gradient(ellipse 60% 60% at 50% 52%, rgba(91,141,239,0.07) 0%, transparent 70%)",
};

export const scanlines: CSSProperties = {
  background:
    "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)",
};

export const TICKS = 20;

export const traces = [
  { d: "M 430 500 H 330 V 440 H 250 V 380", len: 160, dur: 1.2, delay: 0.3 },
  { d: "M 430 510 H 310 V 560 H 220 V 620", len: 200, dur: 1.4, delay: 0.5 },
  { d: "M 570 490 H 680 V 430 H 760 V 370", len: 220, dur: 1.3, delay: 0.4 },
  { d: "M 575 515 H 690 V 570 H 790 V 640", len: 180, dur: 1.5, delay: 0.6 },
  { d: "M 495 360 V 290 H 560 V 230", len: 130, dur: 1.1, delay: 0.7 },
  { d: "M 510 358 V 260 H 440 V 200", len: 170, dur: 1.3, delay: 0.35 },
  { d: "M 495 645 V 720 H 580 V 780", len: 150, dur: 1.2, delay: 0.8 },
  { d: "M 508 648 V 730 H 420 V 810", len: 190, dur: 1.4, delay: 0.55 },
];

export const nodes = [
  { cx: 250, cy: 380, delay: 1.5 },
  { cx: 220, cy: 620, delay: 1.7 },
  { cx: 760, cy: 370, delay: 1.9 },
  { cx: 790, cy: 640, delay: 1.6 },
  { cx: 560, cy: 230, delay: 1.8 },
  { cx: 440, cy: 200, delay: 2.0 },
];
