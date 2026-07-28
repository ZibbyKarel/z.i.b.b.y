import { describe, expect, it } from "vitest";
import { adfToMarkdown } from "./adf-to-markdown";

const doc = (content: unknown[]) => ({ type: "doc", version: 1, content });
const paragraph = (content: unknown[]) => ({ type: "paragraph", content });
const text = (value: string, marks?: unknown[]) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});

describe("adfToMarkdown", () => {
  it("renders a plain paragraph", () => {
    expect(adfToMarkdown(doc([paragraph([text("Hello world")])]))).toBe("Hello world");
  });

  it("renders multiple paragraphs separated by a blank line", () => {
    expect(adfToMarkdown(doc([paragraph([text("First")]), paragraph([text("Second")])]))).toBe(
      "First\n\nSecond",
    );
  });

  it("renders headings 1-6, clamping an out-of-range level", () => {
    expect(
      adfToMarkdown(doc([{ type: "heading", attrs: { level: 2 }, content: [text("Section")] }])),
    ).toBe("## Section");
    expect(
      adfToMarkdown(doc([{ type: "heading", attrs: { level: 99 }, content: [text("Big")] }])),
    ).toBe("###### Big");
    expect(
      adfToMarkdown(doc([{ type: "heading", attrs: { level: 0 }, content: [text("Zero")] }])),
    ).toBe("# Zero");
    expect(
      adfToMarkdown(doc([{ type: "heading", attrs: { level: -3 }, content: [text("Neg")] }])),
    ).toBe("# Neg");
  });

  it("renders a bullet list", () => {
    const md = adfToMarkdown(
      doc([
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph([text("first")])] },
            { type: "listItem", content: [paragraph([text("second")])] },
          ],
        },
      ]),
    );
    expect(md).toBe("- first\n- second");
  });

  it("renders an ordered list with 1-based indices", () => {
    const md = adfToMarkdown(
      doc([
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [paragraph([text("alpha")])] },
            { type: "listItem", content: [paragraph([text("beta")])] },
          ],
        },
      ]),
    );
    expect(md).toBe("1. alpha\n2. beta");
  });

  it("indents a multi-paragraph list item's continuation lines", () => {
    const md = adfToMarkdown(
      doc([
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [paragraph([text("first line")]), paragraph([text("second line")])],
            },
          ],
        },
      ]),
    );
    expect(md).toBe("- first line\n\n  second line");
  });

  it("renders a fenced code block with its language", () => {
    const md = adfToMarkdown(
      doc([
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [text("const x = 1;")],
        },
      ]),
    );
    expect(md).toBe("```ts\nconst x = 1;\n```");
  });

  it("renders a code block with no language attr as an unlabeled fence", () => {
    const md = adfToMarkdown(doc([{ type: "codeBlock", content: [text("plain")] }]));
    expect(md).toBe("```\nplain\n```");
  });

  it("renders a link mark", () => {
    const md = adfToMarkdown(
      doc([
        paragraph([text("see docs", [{ type: "link", attrs: { href: "https://example.com" } }])]),
      ]),
    );
    expect(md).toBe("[see docs](https://example.com)");
  });

  it("renders strong/em/code/strike marks, composable", () => {
    expect(adfToMarkdown(doc([paragraph([text("bold", [{ type: "strong" }])])]))).toBe("**bold**");
    expect(adfToMarkdown(doc([paragraph([text("italic", [{ type: "em" }])])]))).toBe("_italic_");
    expect(adfToMarkdown(doc([paragraph([text("code", [{ type: "code" }])])]))).toBe("`code`");
    expect(adfToMarkdown(doc([paragraph([text("gone", [{ type: "strike" }])])]))).toBe("~~gone~~");
    // Composable: strong + em together.
    expect(
      adfToMarkdown(doc([paragraph([text("both", [{ type: "strong" }, { type: "em" }])])])),
    ).toBe("_**both**_");
  });

  it("renders a hardBreak as a newline within a paragraph", () => {
    const md = adfToMarkdown(
      doc([paragraph([text("line one"), { type: "hardBreak" }, text("line two")])]),
    );
    expect(md).toBe("line one\nline two");
  });

  it("ignores an unrecognised mark rather than throwing", () => {
    expect(adfToMarkdown(doc([paragraph([text("plain", [{ type: "underline" }])])]))).toBe("plain");
  });

  // --- Malformed / degenerate input: must degrade to text content, never throw ---

  it("returns an empty string for null", () => {
    expect(adfToMarkdown(null)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(adfToMarkdown(undefined)).toBe("");
  });

  it("returns a bare string unchanged", () => {
    expect(adfToMarkdown("just a plain string, not ADF at all")).toBe(
      "just a plain string, not ADF at all",
    );
  });

  it("stringifies a bare number/boolean rather than throwing", () => {
    expect(adfToMarkdown(42)).toBe("42");
    expect(adfToMarkdown(true)).toBe("true");
  });

  it("degrades an unrecognised node type to its concatenated text content", () => {
    const md = adfToMarkdown(
      doc([
        { type: "panel", attrs: { panelType: "info" }, content: [paragraph([text("heads up")])] },
      ]),
    );
    expect(md).toBe("heads up");
  });

  it("degrades a node with no type at all", () => {
    expect(adfToMarkdown({ content: [paragraph([text("no type here")])] })).toBe("no type here");
  });

  it("tolerates a text node with a non-array marks field", () => {
    expect(adfToMarkdown(doc([paragraph([{ type: "text", text: "ok", marks: "oops" }])]))).toBe(
      "ok",
    );
  });

  it("tolerates a heading with non-object attrs", () => {
    expect(
      adfToMarkdown(doc([{ type: "heading", attrs: "oops", content: [text("still renders")] }])),
    ).toBe("# still renders");
  });

  it("degrades to the raw value when `content` isn't an array at all", () => {
    // Malformed shape (content should be an array of child nodes) — the
    // flattener degrades to the value's own text rather than throwing.
    expect(adfToMarkdown(doc("not an array" as unknown as unknown[]))).toBe("not an array");
    expect(adfToMarkdown(paragraph("also not an array" as unknown as unknown[]))).toBe(
      "also not an array",
    );
  });

  it("tolerates an array of garbage entries mixed with valid ones", () => {
    const md = adfToMarkdown(doc([null, 42, "loose string", paragraph([text("real content")])]));
    expect(md).toContain("real content");
  });

  it("caps recursion depth on an absurdly deep, non-cyclic node without throwing", () => {
    let node: unknown = paragraph([text("bottom")]);
    for (let i = 0; i < 5000; i += 1) {
      node = { type: "panel", content: [node] };
    }
    expect(() => adfToMarkdown(doc([node]))).not.toThrow();
  });

  it("caps recursion depth on a structurally self-referential node without throwing or hanging", () => {
    const cyclic: Record<string, unknown> = { type: "paragraph", content: [] };
    (cyclic.content as unknown[]).push(cyclic);
    expect(() => adfToMarkdown(doc([cyclic]))).not.toThrow();
  });

  it("caps recursion depth on a self-referential array without throwing or hanging", () => {
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    expect(() => adfToMarkdown(doc(cyclicArray))).not.toThrow();
  });
});
