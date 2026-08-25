/**
 * Atlassian Document Format → plain text.
 *
 * Jira returns issue descriptions and comment bodies as ADF (a JSON node tree),
 * and the channel item's `text` must be readable prose: it is what the triager
 * classifies, what the reply researcher answers, and what the operator reads in
 * the approval. Tolerant by construction — an unknown node type recurses into
 * its `content` rather than throwing, so a future ADF revision degrades to
 * "slightly worse text", never to a failed poll.
 *
 * Pure module, no Nest DI: the adapter and the tests both import it directly.
 */

interface AdfNode {
  type?: string;
  text?: string;
  content?: unknown[];
  attrs?: Record<string, unknown>;
  marks?: unknown[];
}

/** Narrow an unknown to an object we can walk; anything else is empty. */
function asNode(value: unknown): AdfNode | null {
  return typeof value === "object" && value !== null ? (value as AdfNode) : null;
}

function childrenOf(node: AdfNode): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function attrString(node: AdfNode, key: string): string | undefined {
  const raw = node.attrs?.[key];
  return typeof raw === "string" ? raw : undefined;
}

/** The `href` of a link mark on this node, if any. */
function linkHref(node: AdfNode): string | undefined {
  if (!Array.isArray(node.marks)) return undefined;
  for (const raw of node.marks) {
    const mark = asNode(raw);
    if (mark?.type !== "link") continue;
    const href = attrString(mark, "href");
    if (href) return href;
  }
  return undefined;
}

/** Render a node's children and join them with `sep`, dropping empties. */
function renderChildren(node: AdfNode, sep: string): string {
  return childrenOf(node)
    .map((child) => render(child))
    .filter((s) => s.length > 0)
    .join(sep);
}

function render(value: unknown): string {
  const node = asNode(value);
  if (!node) return "";

  switch (node.type) {
    case "text": {
      const text = typeof node.text === "string" ? node.text : "";
      const href = linkHref(node);
      return href ? `${text} (${href})` : text;
    }
    case "hardBreak":
      return "\n";
    case "rule":
      return "---";
    case "mention":
      return `@${attrString(node, "text")?.replace(/^@/, "") ?? attrString(node, "id") ?? "unknown"}`;
    case "emoji":
      return attrString(node, "shortName") ?? attrString(node, "text") ?? "";
    case "status":
      // A Jira status lozenge (e.g. "In Progress") carries no `content` at
      // all — only `attrs.text` — so it needs its own case; the default
      // case's `renderChildren` has nothing to recurse into and drops it.
      return attrString(node, "text") ?? "";
    case "date":
      // Same shape as `status`: attrs-only, no `content`.
      return attrString(node, "timestamp") ?? "";
    case "inlineCard":
    case "blockCard":
      return attrString(node, "url") ?? "";
    case "media":
    case "mediaGroup":
    case "mediaSingle":
      return "[attachment]";
    case "listItem":
      // No marker here — the parent list owns it, since a bullet and an
      // ordered list render different markers for the same node type.
      return renderChildren(node, "\n");
    case "bulletList":
      return childrenOf(node)
        .map((child) => render(child))
        .filter((s) => s.length > 0)
        .map((item) => `- ${item}`)
        .join("\n");
    case "orderedList":
      return childrenOf(node)
        .map((child) => render(child))
        .filter((s) => s.length > 0)
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");
    case "codeBlock":
    case "paragraph":
    case "heading":
      return renderChildren(node, "");
    case "blockquote":
      // Unlike codeBlock/paragraph/heading, a blockquote's children are
      // BLOCK-level nodes (typically paragraphs) — joining with "" jams a
      // multi-paragraph quote's words together with no separator at all.
      return renderChildren(node, "\n\n");
    case "doc":
      return renderChildren(node, "\n\n");
    default:
      // Unknown node: keep whatever text hides inside it.
      return renderChildren(node, "\n\n");
  }
}

/**
 * Flatten an ADF document to plain text. Returns `""` for null/undefined/non-object
 * input (a Jira issue with no description is exactly that).
 */
export function adfToText(node: unknown): string {
  return render(node)
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/**
 * Every `mention` node's `attrs.id` (an Atlassian accountId), at any depth.
 *
 * A mention with no `attrs.id` is skipped: that is the shape the one-time
 * GitHub→Jira migration produced (`data-id="id-0"` placeholders), and matching
 * it would resurrect exactly the backlog the operator asked to stay out of.
 */
export function collectMentionAccountIds(node: unknown): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    const n = asNode(value);
    if (!n) return;
    if (n.type === "mention") {
      const id = attrString(n, "id");
      if (id) out.push(id);
    }
    for (const child of childrenOf(n)) walk(child);
  };
  walk(node);
  return out;
}
