import fs from "node:fs";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import type { Box } from "./qa/pixel.ts";
import type { Plan } from "./schemas.ts";

/**
 * Front-cover overlay, in the pixel space of `cover-art/approved.png` (8.625x11.25 in at 300 DPI,
 * spine edge on the left, bleed on the other three sides). Produce uses the same layout to check
 * that the art keeps those zones calm; render draws it. One layout, so they can never disagree.
 */
export const FRONT_W = 2588;
export const FRONT_H = 3375;
const BLEED = 38;
const TRIM_W = 2550;
const SAFE = 112;
const SAFE_W = TRIM_W - 2 * SAFE;
const TITLE_TOP = BLEED + 150;
const MAX_TITLE_PX = 330;
const BADGE_R = 150;

export interface CoverLayout {
  /** Title, subtitle and badges as one transparent SVG of FRONT_W x FRONT_H. */
  svg: string;
  /** Where the title, subtitle and buddies sit: the art must stay calm here. */
  titleZone: Box;
  badgeZone: Box | null;
  /** One box per `cover.titleBuddies` entry; the sticker is fitted inside, bottom-centred. */
  buddies: Box[];
}

const FONT_FILE = fileURLToPath(new URL("../fonts/LuckiestGuy-Regular.ttf", import.meta.url));
type Font = ReturnType<typeof fontkit.create>;
let cached: Font | undefined;
const font = (): Font => (cached ??= fontkit.create(fs.readFileSync(FONT_FILE)));

interface Glyph {
  d: string;
  x: number;
  advance: number;
}

/** Glyph outlines of one line at 1 unit = 1 font unit, plus the line's width and top above baseline. */
function shape(text: string): { glyphs: Glyph[]; width: number; top: number } {
  const f = font();
  const run = f.layout(text);
  let x = 0;
  let top = f.capHeight;
  const glyphs = run.glyphs.map((g, i) => {
    const advance = run.positions[i]?.xAdvance ?? g.advanceWidth;
    const out = { d: g.path.toSVG(), x, advance };
    top = Math.max(top, g.bbox.maxY);
    x += advance;
    return out;
  });
  return { glyphs, width: x, top };
}

/** One line, or two lines split at the word break that makes them closest in width. */
function splitTitle(title: string, maxPx = MAX_TITLE_PX): string[] {
  const words = title.trim().split(/\s+/);
  const one = shape(title).width * (maxPx / font().unitsPerEm);
  if (words.length < 2 || one <= SAFE_W) return [title];
  let best = [title];
  let bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const w = Math.max(...lines.map((l) => shape(l).width));
    if (w < bestW) [best, bestW] = [lines, w];
  }
  return best;
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

interface Placed {
  size: number;
  x: number;
  baseline: number;
  top: number;
  width: number;
  glyphs: Glyph[];
}

function place(text: string, maxPx: number, y: number, maxW = SAFE_W): Placed {
  const s = shape(text);
  const upm = font().unitsPerEm;
  const size = Math.min(maxPx, (maxW / s.width) * upm);
  const k = size / upm;
  const width = s.width * k;
  return {
    size,
    x: (TRIM_W - width) / 2,
    baseline: y + s.top * k,
    top: y,
    width,
    glyphs: s.glyphs,
  };
}

/**
 * Playful title: every letter its own colour from the palette, tilted and bobbing alternately,
 * a thick outline and a drop shadow so it reads on any art.
 */
function lettersSvg(lines: Placed[], palette: string[], outline: string): string {
  const upm = font().unitsPerEm;
  const layers = { shadow: "", stroke: "", fill: "" };
  let n = 0;
  for (const l of lines) {
    const k = l.size / upm;
    for (const [i, g] of l.glyphs.entries()) {
      if (!g.d) continue;
      const up = i % 2 === 0 ? -1 : 1;
      const tx = (l.x + g.x * k).toFixed(1);
      const ty = (l.baseline + up * l.size * 0.03).toFixed(1);
      const pivot = `${((g.advance / 2) * k).toFixed(1)} ${(-l.size * 0.35).toFixed(1)}`;
      const at = `translate(${tx} ${ty}) rotate(${up * 4} ${pivot}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})`;
      const path = `<path transform="${at}" d="${g.d}"/>`;
      layers.shadow += path;
      layers.stroke += path;
      layers.fill += `<path transform="${at}" d="${g.d}" fill="${palette[n++ % palette.length]}"/>`;
    }
  }
  // In glyph units (after scale(k)), so every line gets an outline of 16% of its own size.
  const stroke = `fill="${outline}" stroke="${outline}" stroke-width="${(upm * 0.16).toFixed(0)}" stroke-linejoin="round"`;
  return [
    `<g ${stroke} transform="translate(14 18)" opacity="0.55">${layers.shadow}</g>`,
    `<g ${stroke}>${layers.stroke}</g>`,
    `<g>${layers.fill}</g>`,
  ].join("\n");
}

const BADGE_TEXT_W = BADGE_R * 1.45;

/** Badge label wrapped into at most three lines, and the largest size at which they fit the disc. */
function badgeText(label: string): { lines: string[]; size: number } {
  const upm = font().unitsPerEm;
  const lines: string[] = [];
  for (const w of label.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last && shape(`${last} ${w}`).width * (44 / upm) <= BADGE_TEXT_W)
      lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w);
  }
  const shown = lines.slice(0, 3);
  const size = Math.min(56, ...shown.map((l) => (BADGE_TEXT_W / (shape(l).width || 1)) * upm));
  return { lines: shown, size };
}

function badgeSvg(lines: string[], size: number, cx: number, cy: number, ink: string): string {
  const upm = font().unitsPerEm;
  const lh = size * 1.1;
  let out = `<circle cx="${cx}" cy="${cy}" r="${BADGE_R}" fill="#ffffff" stroke="${ink}" stroke-width="14"/>`;
  lines.forEach((l, i) => {
    const p = place(l, size, cy - (lines.length * lh) / 2 + i * lh, BADGE_TEXT_W);
    const k = p.size / upm;
    const x0 = cx - p.width / 2;
    for (const g of p.glyphs)
      if (g.d)
        out += `<path fill="${ink}" transform="translate(${(x0 + g.x * k).toFixed(1)} ${p.baseline.toFixed(1)}) scale(${k.toFixed(5)} ${(-k).toFixed(5)})" d="${g.d}"/>`;
  });
  return out;
}

const COVER_DEFAULTS = { titleFill: "#ffffff", titleOutline: "#1f2a44" };

export function coverLayout(plan: Plan): CoverLayout {
  const { cover } = plan;
  const outline = cover.titleOutline ?? COVER_DEFAULTS.titleOutline;
  const palette = cover.titlePalette ?? [cover.titleFill ?? COVER_DEFAULTS.titleFill];
  const texts = splitTitle(plan.title);
  const maxPx = texts.length === 1 ? MAX_TITLE_PX : MAX_TITLE_PX * 0.85;

  // A buddy sitting on the title needs head room above it: push the title down to make it.
  const firstSize = place(texts[0] ?? plan.title, maxPx, 0).size;
  const buddyH = Math.round(firstSize * 1.6);
  const onTop = cover.titleBuddies.some((b) => b.anchor === "on-top");
  let y = TITLE_TOP + (onTop ? Math.round(buddyH * 0.8) : 0);
  const lines: Placed[] = [];
  for (const t of texts) {
    const l = place(t, maxPx, y);
    lines.push(l);
    y = l.baseline + l.size * 0.18;
  }
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) throw new Error("cover title is empty");

  const buddies = cover.titleBuddies.map((b): Box => {
    const line = b.anchor === "on-top" ? first : last;
    const cx = line.x + line.width * (0.1 + 0.8 * b.at);
    const w = buddyH;
    // on-top: feet sink 20% into the letters; hanging: hands grip the bottom 25% of the last line.
    const top =
      b.anchor === "on-top"
        ? Math.round(line.top + (line.baseline - line.top) * 0.2 - buddyH)
        : Math.round(line.baseline - (line.baseline - line.top) * 0.25);
    return { x: Math.round(cx - w / 2), y: top, w, h: buddyH };
  });
  let bottom = Math.max(y, ...buddies.map((b) => b.y + b.h));

  const subLines: Placed[] = [];
  for (const t of plan.subtitle ? splitTitle(plan.subtitle, 110) : []) {
    const s = place(t, 110, bottom + 30);
    subLines.push(s);
    bottom = s.baseline + s.size * 0.25;
  }
  const subtitle =
    subLines.length > 0
      ? lettersSvg(subLines, [cover.titleFill ?? COVER_DEFAULTS.titleFill], outline)
      : "";
  const top = Math.min(TITLE_TOP, ...buddies.map((b) => b.y));
  const titleZone = { x: SAFE, y: top, w: SAFE_W, h: Math.round(bottom - top) };

  const badgeTexts = (cover.badges ?? []).map(badgeText);
  // One text size for every badge, so the row reads as a set.
  const badgeSize = Math.min(...badgeTexts.map((t) => t.size));
  const badges = badgeTexts.map((t, i) => ({
    lines: t.lines,
    cx: TRIM_W - SAFE - BADGE_R - i * (2 * BADGE_R + 30),
    cy: FRONT_H - BLEED - SAFE - BADGE_R,
  }));
  const badgeZone =
    badges.length === 0
      ? null
      : {
          x: Math.min(...badges.map((b) => b.cx)) - BADGE_R,
          y: FRONT_H - BLEED - SAFE - 2 * BADGE_R,
          w: badges.length * 2 * BADGE_R + (badges.length - 1) * 30,
          h: 2 * BADGE_R,
        };

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FRONT_W}" height="${FRONT_H}" viewBox="0 0 ${FRONT_W} ${FRONT_H}">`,
    `<title>${esc(plan.title)}</title>`,
    lettersSvg(lines, palette, outline),
    subtitle,
    ...badges.map((b) => badgeSvg(b.lines, badgeSize, b.cx, b.cy, outline)),
    "</svg>",
  ].join("\n");
  return { svg, titleZone, badgeZone, buddies };
}
