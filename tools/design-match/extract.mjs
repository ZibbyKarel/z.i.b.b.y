/**
 * Everything in here runs inside the page. The functions are passed to
 * `page.evaluate` as source, so they must not close over anything from module
 * scope — hence the arguments-in, JSON-out shape.
 */

/**
 * Deliberately narrow: the properties listed here are the ones that carry visual
 * meaning, not all ~340 a computed style exposes.
 *
 * D11 (task 19): this used to say "~40 properties" while the array held 51 — a
 * count restated in prose goes stale the moment a property is added, and two
 * independent reviewers had to count it by hand to find that out. The list's
 * length is `VALUE_PROPS.length`; nothing else should ever claim to know it.
 */
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
  // The result is discriminated rather than thrown from inside the page, and
  // that is the whole point (D5, task 15). A throw raised inside
  // `page.evaluate` comes back as `page.evaluate: Error: design-match: …` —
  // Playwright prefixes it — so `isDeliberateError`'s
  // `message.startsWith("design-match:")` is false and cli.mjs's `logFailure`
  // dumps a full stack instead of one clean line. On `compare` that also meant
  // no artifacts were written at all.
  //
  // The same trap as task 16's `networkidle` timeout, solved the same way: the
  // failure is turned into a `design-match:` Error on the NODE side. Doing it
  // by returning a discriminated value (rather than probing with a second
  // `page.evaluate` first) keeps it to one round trip and leaves no window in
  // which the element could appear or vanish between the check and the walk.
  // Any future in-page failure must be reported the same way — a bare `throw`
  // inside this callback loses its classification silently.
  const result = await page.evaluate(
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
      if (!root) return { found: false };
      return { found: true, node: snap(root, 0) };
    },
    { selector, depth, props },
  );
  if (!result.found) {
    throw new Error(
      `design-match: selector "${selector}" neodpovídá žádnému prvku na stránce ${page.url()} — ` +
        `měřená scéna ten uzel nemá. Otevři stránku v prohlížeči, najdi odpovídající element a předej ho přes --selector; ` +
        `selector z designu (spec.json) v implementaci zpravidla neexistuje.`,
    );
  }
  return result.node;
}
