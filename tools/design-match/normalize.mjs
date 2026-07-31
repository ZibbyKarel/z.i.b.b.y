/**
 * Turns a raw DOM snapshot into the structural fingerprint the skeleton gate
 * compares. Everything here is pure so it can be unit-tested without a browser —
 * the browser's only job is to hand us `box` and `layout` numbers.
 */

const ROLE_BY_TAG = {
  form: "form",
  label: "label",
  input: "input",
  textarea: "input",
  select: "input",
  button: "action",
  a: "action",
  img: "image",
  svg: "icon",
  ul: "list",
  ol: "list",
  li: "list-item",
  table: "table",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
};

const round = (n) => Math.round(n * 1000) / 1000;

function layoutMode({ display, flexDirection }) {
  if (display === "grid" || display === "inline-grid") return "grid";
  if (display === "flex" || display === "inline-flex") {
    return flexDirection.startsWith("column") ? "flex-column" : "flex-row";
  }
  if (display.startsWith("inline")) return "inline";
  return "block";
}

function columnCount(gridTemplateColumns) {
  if (!gridTemplateColumns || gridTemplateColumns === "none") return 0;
  return gridTemplateColumns.trim().split(/\s+/).length;
}

function inferRole(raw) {
  const byTag = ROLE_BY_TAG[raw.tag];
  if (byTag) return byTag;
  if (raw.attrs.role) return raw.attrs.role;
  const hint = [...raw.classes, raw.attrs["data-role"] ?? ""].join(" ").toLowerCase();
  if (/\brow\b/.test(hint)) return "row";
  if (/\bcol(umn)?\b/.test(hint)) return "column";
  if (/\bcard\b/.test(hint)) return "card";
  if (raw.text && raw.children.length === 0) return "text";
  return "group";
}

/** A wrapper is a node that neither lays anything out nor occupies its own area. */
function isCollapsibleWrapper(raw, parentBox) {
  if (raw.children.length !== 1) return false;
  if (layoutMode(raw.layout) !== "block") return false;
  if (!parentBox) return false;
  const sameBox =
    Math.abs(raw.box.w - parentBox.w) < 1 &&
    Math.abs(raw.box.h - parentBox.h) < 1 &&
    Math.abs(raw.box.x - parentBox.x) < 1 &&
    Math.abs(raw.box.y - parentBox.y) < 1;
  return sameBox;
}

function relativeTo(box, parentBox) {
  if (!parentBox || parentBox.w === 0 || parentBox.h === 0) {
    return { w: 1, h: 1, x: 0, y: 0 };
  }
  return {
    w: round(box.w / parentBox.w),
    h: round(box.h / parentBox.h),
    x: round((box.x - parentBox.x) / parentBox.w),
    y: round((box.y - parentBox.y) / parentBox.h),
  };
}

function build(raw, parentBox, options) {
  const children = [...raw.children].sort((a, b) => a.layout.order - b.layout.order);
  return {
    role: inferRole(raw),
    tag: raw.tag,
    layout: {
      mode: layoutMode(raw.layout),
      direction: raw.layout.flexDirection,
      columns: columnCount(raw.layout.gridTemplateColumns),
      wrap: raw.layout.flexWrap,
      align: raw.layout.alignItems,
    },
    rel: relativeTo(raw.box, parentBox),
    children: children.flatMap((child) => {
      if (!options.strictWrappers && isCollapsibleWrapper(child, raw.box)) {
        return build(child.children[0], raw.box, options);
      }
      return build(child, raw.box, options);
    }),
  };
}

export function normalizeSkeleton(raw, options = {}) {
  return build(raw, null, { strictWrappers: false, ...options });
}
