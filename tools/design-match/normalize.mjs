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

/**
 * `role` and `data-role` are both an author's explicit, first-class declaration
 * of what a node is — unlike a class name, which is a naming convention. Treat
 * them alike, with `role` winning if a node somehow carries both.
 */
function declaredRole(raw) {
  return raw.attrs.role || raw.attrs["data-role"] || null;
}

function inferRole(raw) {
  const byTag = ROLE_BY_TAG[raw.tag];
  if (byTag) return byTag;
  const declared = declaredRole(raw);
  if (declared) return declared;
  const hint = raw.classes.join(" ").toLowerCase();
  if (/\brow\b/.test(hint)) return "row";
  if (/\bcol(umn)?\b/.test(hint)) return "column";
  if (/\bcard\b/.test(hint)) return "card";
  if (raw.text && raw.children.length === 0) return "text";
  return "group";
}

/**
 * The structural-comparison counterpart to `inferRole`. Only a tag or an
 * explicit author declaration is a real semantic commitment — a class name is
 * a naming convention, not structure, so it plays no part here. Anything left
 * over collapses to the neutral `"node"`.
 */
function inferMatchRole(raw) {
  const byTag = ROLE_BY_TAG[raw.tag];
  if (byTag) return byTag;
  const declared = declaredRole(raw);
  if (declared) return declared;
  return "node";
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

/** Resolves a chain of consecutive collapsible wrappers down to the surviving node. */
function resolveThroughWrappers(child, parentBox, options) {
  while (!options.strictWrappers && isCollapsibleWrapper(child, parentBox)) {
    child = child.children[0];
  }
  return child;
}

function build(raw, parentBox, options) {
  const children = [...raw.children].sort((a, b) => a.layout.order - b.layout.order);
  return {
    role: inferRole(raw),
    matchRole: inferMatchRole(raw),
    tag: raw.tag,
    layout: {
      mode: layoutMode(raw.layout),
      direction: raw.layout.flexDirection,
      columns: columnCount(raw.layout.gridTemplateColumns),
      wrap: raw.layout.flexWrap,
      align: raw.layout.alignItems,
    },
    rel: relativeTo(raw.box, parentBox),
    children: children.map((child) =>
      build(resolveThroughWrappers(child, raw.box, options), raw.box, options),
    ),
  };
}

export function normalizeSkeleton(raw, options = {}) {
  return build(raw, null, { strictWrappers: false, ...options });
}
