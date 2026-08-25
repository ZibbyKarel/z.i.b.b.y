import { describe, expect, it } from "vitest";
import { adfToText, collectMentionAccountIds } from "./adf-to-text";

describe("adfToText", () => {
  it("joins paragraphs with a blank line", () => {
    const doc = {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First." }] },
        { type: "paragraph", content: [{ type: "text", text: "Second." }] },
      ],
    };
    expect(adfToText(doc)).toBe("First.\n\nSecond.");
  });

  it("renders a mention as @name and a link as text (href)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { id: "acc-1", text: "@Karel" } },
            { type: "text", text: " see " },
            {
              type: "text",
              text: "the docs",
              marks: [{ type: "link", attrs: { href: "https://example.test/d" } }],
            },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("@Karel see the docs (https://example.test/d)");
  });

  it("renders bullet lists one item per line", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
            },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("- one\n- two");
  });

  it("keeps code block content and turns hardBreak into a newline", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "codeBlock", content: [{ type: "text", text: "npm run build" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a" },
            { type: "hardBreak" },
            { type: "text", text: "b" },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("npm run build\n\na\nb");
  });

  it("recurses into unknown node types instead of throwing", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "someFutureNode",
          content: [{ type: "paragraph", content: [{ type: "text", text: "kept" }] }],
        },
      ],
    };
    expect(adfToText(doc)).toBe("kept");
  });

  it("returns an empty string for null, undefined and non-objects", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
    expect(adfToText("already a string")).toBe("");
    expect(adfToText(42)).toBe("");
  });

  it("joins a blockquote's paragraph children with a blank line (not jammed together)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "First quoted para." }] },
            { type: "paragraph", content: [{ type: "text", text: "Second quoted para." }] },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("First quoted para.\n\nSecond quoted para.");
  });

  it("renders an orderedList with numbered markers, not bullet dashes", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
            },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toBe("1. one\n2. two");
  });

  it("renders a status lozenge's text and a date's timestamp instead of dropping them", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Status: " },
            { type: "status", attrs: { text: "In Progress", color: "yellow" } },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "date", attrs: { timestamp: "1700000000000" } }],
        },
      ],
    };
    expect(adfToText(doc)).toBe("Status: In Progress\n\n1700000000000");
  });
});

describe("collectMentionAccountIds", () => {
  it("collects every mention accountId, nested at any depth", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "mention", attrs: { id: "acc-1", text: "@A" } }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "mention", attrs: { id: "acc-2", text: "@B" } }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(collectMentionAccountIds(doc).sort()).toEqual(["acc-1", "acc-2"]);
  });

  it("returns an empty array when there are no mentions", () => {
    expect(collectMentionAccountIds({ type: "doc", content: [] })).toEqual([]);
    expect(collectMentionAccountIds(null)).toEqual([]);
  });

  it("ignores a mention node with no attrs.id (migrated placeholder)", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "mention", attrs: { text: "@Ghost" } }] }],
    };
    expect(collectMentionAccountIds(doc)).toEqual([]);
  });
});
