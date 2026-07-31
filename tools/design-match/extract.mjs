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

/**
 * Snapshot the raw tree in the shape `normalizeSkeleton` consumes — structure
 * AND values, from the one `getComputedStyle` call per node this walk already
 * makes. This is the tool's only DOM walk: the skeleton it feeds is the single
 * address space every later layer names nodes in.
 */
export async function extractRaw(page, selector, depth = 6, props = VALUE_PROPS) {
  return page.evaluate(
    ({ selector, depth, props }) => {
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
        const visibleChildren = [...el.children].filter(visible);
        // A node cut off by the depth cap reports `children: []`, which is
        // indistinguishable from a genuine leaf — and "this subtree is empty"
        // and "this subtree was not looked at" are not the same fact. The
        // emptiness guard (cli.mjs) has to be able to tell them apart, or it
        // refuses a mockup whose content simply sits below the cut.
        const truncated = level >= depth && visibleChildren.length > 0;
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
          values: Object.fromEntries(props.map((prop) => [prop, style[prop]])),
          box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
          layout: {
            display: style.display,
            flexDirection: style.flexDirection,
            gridTemplateColumns: style.gridTemplateColumns,
            flexWrap: style.flexWrap,
            alignItems: style.alignItems,
            order: Number(style.order) || 0,
          },
          truncated,
          children: level >= depth ? [] : visibleChildren.map((child) => snap(child, level + 1)),
        };
      };

      const root = document.querySelector(selector);
      if (!root) throw new Error(`design-match: selector not found: ${selector}`);
      return snap(root, 0);
    },
    { selector, depth, props },
  );
}
