/**
 * Flatten a Jira API v3 "Atlassian Document Format" (ADF) `description` into
 * markdown for `RoadmapItem.description` (125b — see `docs/plans/phase-125/
 * recon/scheduler-pr-integrations.md` section 5's watch-out: v3 returns ADF
 * JSON, never plain text).
 *
 * Deliberately small and bounded: paragraphs, headings, bullet/ordered lists,
 * code blocks, links, and the inline marks `strong`/`em`/`code`/`strike` are
 * the only vocabulary rendered with real markdown syntax. Everything else —
 * an unrecognised node `type`, a node with no `type` at all, `null`, a bare
 * string, a number, an absurdly deep or (structurally) cyclic object — degrades
 * to its concatenated text content and NEVER throws. That is a hard
 * requirement: a single malformed field on one Jira issue must never fail an
 * entire sync (Law 4 also bears on this — an issue body is untrusted data, so
 * the flattener must be inert on anything it doesn't expect, not just on
 * anything well-formed).
 *
 * Recursion depth is capped explicitly (`MAX_DEPTH`) rather than relying on a
 * stack-overflow to eventually stop a pathological input — ADF from a real
 * Jira instance is never anywhere near this deep, but a hand-crafted or
 * corrupted payload (including a JS object with a genuine self-reference,
 * which cannot occur in real JSON but IS constructible by a test) must still
 * terminate cheaply and deterministically instead of blowing the stack.
 */

const MAX_DEPTH = 64;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Last-resort fallback: walk anything (a node, an array, a mark, garbage) and
 * concatenate every `text` string found, ignoring structure entirely. Used
 * both as the top-level catch-all (`adfToMarkdown`'s `catch`) and per-node
 * whenever a `type` isn't recognised but the node still carries a `content`
 * array worth descending into.
 */
function safeFlatten(node: unknown, depth: number): string {
  if (depth > MAX_DEPTH) return "";
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) {
    return node
      .map((entry) => safeFlatten(entry, depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  if (isPlainObject(node)) {
    if (typeof node.text === "string") return node.text;
    if (Array.isArray(node.content)) return safeFlatten(node.content, depth + 1);
    return "";
  }
  return "";
}

function clampHeadingLevel(attrs: unknown): number {
  const raw = isPlainObject(attrs) && typeof attrs.level === "number" ? attrs.level : 1;
  const truncated = Math.trunc(raw);
  return Math.min(6, Math.max(1, truncated || 1));
}

/** Apply ADF inline marks (`strong`/`em`/`code`/`strike`/`link`) to already-escaped inline text. */
function applyMarks(text: string, marks: unknown): string {
  if (!Array.isArray(marks)) return text;
  let out = text;
  for (const mark of marks) {
    if (!isPlainObject(mark) || typeof mark.type !== "string") continue;
    switch (mark.type) {
      case "strong":
        out = `**${out}**`;
        break;
      case "em":
        out = `_${out}_`;
        break;
      case "code":
        out = `\`${out}\``;
        break;
      case "strike":
        out = `~~${out}~~`;
        break;
      case "link": {
        const href =
          isPlainObject(mark.attrs) && typeof mark.attrs.href === "string"
            ? mark.attrs.href
            : undefined;
        if (href) out = `[${out}](${href})`;
        break;
      }
      default:
        // Unrecognised mark (underline, subsup, textColor, ...) — leave the
        // text unstyled rather than guessing at syntax.
        break;
    }
  }
  return out;
}

/** Render an ADF inline-content array (the children of a paragraph/heading/listItem). */
function renderInline(content: unknown, depth: number): string {
  if (depth > MAX_DEPTH) return safeFlatten(content, depth);
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((node) => renderInline(node, depth + 1)).join("");
  }
  if (!isPlainObject(content)) return "";

  const type = typeof content.type === "string" ? content.type : undefined;
  if (type === "text" || (type === undefined && typeof content.text === "string")) {
    const text = typeof content.text === "string" ? content.text : "";
    return applyMarks(text, content.marks);
  }
  if (type === "hardBreak") return "\n";
  if (type === "mention") {
    const attrs = content.attrs;
    return isPlainObject(attrs) && typeof attrs.text === "string" ? attrs.text : "@mention";
  }
  if (type === "emoji") {
    const attrs = content.attrs;
    return isPlainObject(attrs) && typeof attrs.shortName === "string" ? attrs.shortName : "";
  }
  // Unrecognised inline node — degrade to its own inline content, then to raw text.
  const nested = renderInline(content.content, depth + 1);
  return nested || safeFlatten(content, depth + 1);
}

function renderList(content: unknown, depth: number, marker: (index: number) => string): string {
  if (depth > MAX_DEPTH) return safeFlatten(content, depth);
  if (!Array.isArray(content)) return "";
  return content
    .map((item, index) => {
      const body = isPlainObject(item)
        ? renderBlock(item.content, depth + 1)
        : safeFlatten(item, depth + 1);
      const lines = body.split("\n");
      return lines
        .map((line, i) => {
          if (i === 0) return `${marker(index)}${line}`;
          // A blank separator line (between two paragraphs in the same list
          // item) stays blank rather than becoming trailing whitespace.
          return line.length > 0 ? `  ${line}` : "";
        })
        .join("\n");
    })
    .join("\n");
}

/** Render an ADF block-level node (or an array of them) to markdown. */
function renderBlock(node: unknown, depth: number): string {
  if (depth > MAX_DEPTH) return safeFlatten(node, depth);
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) {
    return node
      .map((entry) => renderBlock(entry, depth + 1))
      .filter((rendered) => rendered.length > 0)
      .join("\n\n");
  }
  if (!isPlainObject(node)) return "";

  const type = typeof node.type === "string" ? node.type : undefined;
  switch (type) {
    case "doc":
      return renderBlock(node.content, depth + 1);
    case "paragraph":
      return renderInline(node.content, depth + 1);
    case "heading": {
      const level = clampHeadingLevel(node.attrs);
      return `${"#".repeat(level)} ${renderInline(node.content, depth + 1)}`.trimEnd();
    }
    case "codeBlock": {
      const language =
        isPlainObject(node.attrs) && typeof node.attrs.language === "string"
          ? node.attrs.language
          : "";
      const code = safeFlatten(node.content, depth + 1);
      return `\`\`\`${language}\n${code}\n\`\`\``;
    }
    case "bulletList":
      return renderList(node.content, depth + 1, () => "- ");
    case "orderedList":
      return renderList(node.content, depth + 1, (index) => `${index + 1}. `);
    case "listItem":
      // Only reached if a listItem is rendered outside a list (malformed
      // input) — degrade to its own block content.
      return renderBlock(node.content, depth + 1);
    case "blockquote":
      return renderBlock(node.content, depth + 1)
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n");
    case "rule":
      return "---";
    default: {
      // Unrecognised block type — degrade to its own content, then to its
      // concatenated text.
      const nested = renderBlock(node.content, depth + 1);
      return nested || safeFlatten(node, depth + 1);
    }
  }
}

/**
 * Flatten a Jira ADF `description` (or anything degenerate) into markdown.
 * Never throws: a structured-rendering failure anywhere in the tree falls
 * back to concatenating every string of `text` found, in document order.
 */
export function adfToMarkdown(doc: unknown): string {
  try {
    return renderBlock(doc, 0).trim();
  } catch {
    return safeFlatten(doc, 0).trim();
  }
}
