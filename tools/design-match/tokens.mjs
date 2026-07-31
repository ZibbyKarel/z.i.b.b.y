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

export function parseThemeTokens(css) {
  const tokens = [];
  const themeBlock = /@theme[^{]*\{([\s\S]*?)\}/g;
  let block;
  while ((block = themeBlock.exec(css)) !== null) {
    const decl = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match;
    while ((match = decl.exec(block[1])) !== null) {
      tokens.push({ name: match[1], value: match[2].trim() });
    }
  }
  return tokens;
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const int = Number.parseInt(hex[1], 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value.trim());
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

function parseLength(value) {
  const px = /^(-?[\d.]+)px$/.exec(value.trim());
  return px ? Number(px[1]) : null;
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

export function mapValue(value, tokens) {
  const color = parseColor(value);
  const length = parseLength(value);

  const candidates = tokens
    .map((token) => {
      if (color) {
        const tokenColor = parseColor(token.value);
        return tokenColor ? { token, distance: round(deltaE(color, tokenColor)) } : null;
      }
      if (length !== null) {
        const tokenLength = parseLength(token.value);
        return tokenLength !== null
          ? { token, distance: round(Math.abs(length - tokenLength)) }
          : null;
      }
      return token.value === value ? { token, distance: 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  const best = candidates[0];
  if (best && best.distance === 0) return { kind: "exact", token: best.token.name };
  return {
    kind: "new",
    nearest: best ? best.token.name : null,
    distance: best ? best.distance : null,
    proposedName: null,
  };
}

export function proposeTokenName(role, prop) {
  const prefix = PROP_PREFIX[prop] ?? "misc";
  return `--zt-${prefix}-${role}`;
}
