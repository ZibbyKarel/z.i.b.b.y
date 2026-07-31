/**
 * Everything in here runs inside the page. The functions are passed to
 * `page.evaluate` as source, so they must not close over anything from module
 * scope — hence the arguments-in, JSON-out shape.
 */

/** Deliberately narrow: ~40 properties that carry visual meaning, not all ~340. */
export const VALUE_PROPS = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "justifyContent",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "gridTemplateColumns",
  "gridTemplateRows",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textAlign",
  "color",
  "backgroundColor",
  "backgroundImage",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderColor",
  "borderStyle",
  "borderRadius",
  "boxShadow",
  "opacity",
  "transform",
  "backdropFilter",
  "mixBlendMode",
];

/** Snapshot the raw tree in the shape `normalizeSkeleton` consumes. */
export async function extractRaw(page, selector, depth = 6) {
  return page.evaluate(
    ({ selector, depth }) => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const snap = (el, level) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const ownText = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .join(" ")
          .trim();
        return {
          tag: el.tagName.toLowerCase(),
          classes: [...el.classList],
          attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
          text: ownText,
          box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          layout: {
            display: style.display,
            flexDirection: style.flexDirection,
            gridTemplateColumns: style.gridTemplateColumns,
            flexWrap: style.flexWrap,
            alignItems: style.alignItems,
            order: Number(style.order) || 0,
          },
          children:
            level >= depth
              ? []
              : [...el.children].filter(visible).map((child) => snap(child, level + 1)),
        };
      };

      const root = document.querySelector(selector);
      if (!root) throw new Error(`design-match: selector not found: ${selector}`);
      return snap(root, 0);
    },
    { selector, depth },
  );
}

/**
 * Values keyed by a path built from the raw DOM walk (role + index at each
 * level). This is NOT the same address space as `compareSkeletons`' `path`:
 * that one walks the normalised tree, which collapses pass-through wrappers
 * and re-sorts children by CSS `order`. The same element can therefore carry
 * two different paths — nothing joins the two, and nothing should.
 */
export async function extractValues(page, selector, props = VALUE_PROPS, depth = 6) {
  return page.evaluate(
    ({ selector, props, depth }) => {
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
      const roleOf = (el) => {
        const byTag = ROLE_BY_TAG[el.tagName.toLowerCase()];
        if (byTag) return byTag;
        // `role` and `data-role` are both an author's explicit declaration, unlike
        // a class name — read with the same precedence normalize.mjs's inferRole
        // uses, so skeleton paths and value paths agree on tag- and declared-role-
        // derived roles. They still diverge on class-hint-derived roles below
        // (row/column/card come from this file's own hint regexes, not
        // normalize.mjs's) — that gap is a separate, currently open defect.
        const declared = el.getAttribute("role") || el.getAttribute("data-role");
        if (declared) return declared;
        const hint = [...el.classList].join(" ").toLowerCase();
        if (/\brow\b/.test(hint)) return "row";
        if (/\bcol(umn)?\b/.test(hint)) return "column";
        if (/\bcard\b/.test(hint)) return "card";
        return "group";
      };
      const visible = (el) => {
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")
          return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const out = {};
      const walk = (el, path, level) => {
        const style = getComputedStyle(el);
        out[path] = Object.fromEntries(props.map((p) => [p, style[p]]));
        if (level >= depth) return;
        [...el.children].filter(visible).forEach((child, index) => {
          walk(child, `${path}/${roleOf(child)}[${index}]`, level + 1);
        });
      };

      const root = document.querySelector(selector);
      if (!root) throw new Error(`design-match: selector not found: ${selector}`);
      walk(root, roleOf(root), 0);
      return out;
    },
    { selector, props, depth },
  );
}
