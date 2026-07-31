/**
 * Decision 3 of the spec: the design is the truth, so an unmatched value becomes
 * a NEW token. This module's job is to make that growth legible — every new
 * token is reported next to its nearest existing neighbour and the distance, and
 * it is named by role, never by hex.
 */

const PROP_PREFIX = {
  color: "fg",
  backgroundColor: "bg",
  borderColor: "border",
  gap: "space",
  rowGap: "space",
  columnGap: "space",
  paddingTop: "space",
  paddingLeft: "space",
  borderRadius: "radius",
  boxShadow: "shadow",
  fontSize: "text",
  lineHeight: "leading",
  letterSpacing: "tracking",
};

/**
 * `VALUE_PROPS` (extract.mjs) covers ~40 properties for the values comparison;
 * only the ones `PROP_PREFIX` knows a token family for are worth reporting in
 * `tokens.md` — a `display: flex` row would never be covered by a token.
 */
export const TOKEN_PROPS = Object.keys(PROP_PREFIX);

/** Strips /* ... *\/ comments (including multi-line) before any declaration matching. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function parseThemeTokens(css) {
  const tokens = [];
  const stripped = stripComments(css);
  const themeBlock = /@theme[^{]*\{([\s\S]*?)\}/g;
  let block;
  while ((block = themeBlock.exec(stripped)) !== null) {
    const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = decl.exec(block[1])) !== null) {
      tokens.push({ name: match[1], value: match[2].trim() });
    }
  }
  return tokens;
}

/**
 * Parses a colour into its RGB triple and alpha (default 1, opaque). `transparent`
 * is a special case: its RGB is irrelevant, so it is fixed at [0, 0, 0] and alpha 0 —
 * this also makes a computed `rgba(0, 0, 0, 0)` match it exactly, with no separate
 * case needed.
 */
function parseColor(value) {
  const trimmed = value.trim();
  if (/^transparent$/i.test(trimmed)) return { rgb: [0, 0, 0], alpha: 0 };
  const hex = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex) {
    const int = Number.parseInt(hex[1], 16);
    return { rgb: [(int >> 16) & 255, (int >> 8) & 255, int & 255], alpha: 1 };
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(trimmed);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
    return { rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])], alpha };
  }
  return null;
}

/** Root font size (px) used to resolve `rem` lengths. Named, never a buried magic number. */
export const DEFAULT_ROOT_FONT_SIZE_PX = 16;

/**
 * Parses a length into px. `rem` is resolved against `rootFontSizePx`. `em` is
 * deliberately NOT resolved — it depends on the element's own font size, which this
 * module cannot know, so `null` (no candidate) is the honest answer.
 */
function parseLength(value, rootFontSizePx) {
  const trimmed = value.trim();
  const px = /^(-?[\d.]+)px$/.exec(trimmed);
  if (px) return Number(px[1]);
  const rem = /^(-?[\d.]+)rem$/.exec(trimmed);
  if (rem) return Number(rem[1]) * rootFontSizePx;
  return null;
}

function toLab([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

const round = (n) => Math.round(n * 10) / 10;

/**
 * Colour candidates are ranked with equal-alpha matches first, then by ascending
 * (raw) ΔE within each group. A candidate whose alpha differs can still be reported
 * as nearest if nothing better exists — that is honest — but it is never exact.
 */
export function mapValue(value, tokens, { rootFontSizePx = DEFAULT_ROOT_FONT_SIZE_PX } = {}) {
  const color = parseColor(value);
  const length = color ? null : parseLength(value, rootFontSizePx);

  const candidates = tokens
    .map((token) => {
      if (color) {
        const tokenColor = parseColor(token.value);
        if (!tokenColor) return null;
        return {
          token,
          distance: deltaE(color.rgb, tokenColor.rgb),
          alphaMatch: color.alpha === tokenColor.alpha,
        };
      }
      if (length !== null) {
        const tokenLength = parseLength(token.value, rootFontSizePx);
        return tokenLength !== null
          ? { token, distance: Math.abs(length - tokenLength), alphaMatch: true }
          : null;
      }
      return token.value === value ? { token, distance: 0, alphaMatch: true } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.alphaMatch !== b.alphaMatch) return a.alphaMatch ? -1 : 1;
      return a.distance - b.distance;
    });

  const best = candidates[0];
  // Exactness is decided on the RAW distance (and, for colours, matching alpha) —
  // rounding happens only for the number that gets reported below.
  if (best && best.distance === 0 && best.alphaMatch) {
    return { kind: "exact", token: best.token.name };
  }
  return {
    kind: "new",
    nearest: best ? best.token.name : null,
    distance: best ? round(best.distance) : null,
    proposedName: null,
  };
}

export function proposeTokenName(role, prop) {
  const prefix = PROP_PREFIX[prop] ?? "misc";
  return `--zt-${prefix}-${role}`;
}
