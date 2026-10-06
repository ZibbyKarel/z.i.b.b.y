import { describe, expect, it } from "vitest";
import { PinSchema, PinsSchema } from "./pin.schema";

describe("PinSchema — entity pin", () => {
  it("parses an agent/workflow/employee pin", () => {
    expect(PinSchema.safeParse({ kind: "agent", id: "researcher" }).success).toBe(true);
    expect(PinSchema.safeParse({ kind: "workflow", id: "delivery" }).success).toBe(true);
    expect(PinSchema.safeParse({ kind: "employee", id: "emp-1" }).success).toBe(true);
  });

  it("rejects an empty id", () => {
    expect(PinSchema.safeParse({ kind: "agent", id: "" }).success).toBe(false);
  });
});

describe("PinSchema — page pin", () => {
  it("parses a page pin with an href-shaped id and a label", () => {
    const result = PinSchema.safeParse({ kind: "page", id: "/org/people", label: "People" });
    expect(result.success).toBe(true);
  });

  it("rejects an id that doesn't start with /", () => {
    const result = PinSchema.safeParse({ kind: "page", id: "org/people", label: "People" });
    expect(result.success).toBe(false);
  });

  it("rejects a protocol-relative href (//evil.host)", () => {
    const result = PinSchema.safeParse({ kind: "page", id: "//evil.host", label: "Evil" });
    expect(result.success).toBe(false);
  });

  it("rejects a backslash-leading href (/\\evil.host — browsers normalize it like //)", () => {
    const result = PinSchema.safeParse({ kind: "page", id: "/\\evil.host", label: "Evil" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty or whitespace-only label", () => {
    expect(PinSchema.safeParse({ kind: "page", id: "/org/people", label: "" }).success).toBe(false);
    expect(PinSchema.safeParse({ kind: "page", id: "/org/people", label: "   " }).success).toBe(
      false,
    );
  });

  it("rejects a label past the max length", () => {
    const result = PinSchema.safeParse({
      kind: "page",
      id: "/org/people",
      label: "x".repeat(81),
    });
    expect(result.success).toBe(false);
  });

  it("trims the label", () => {
    const result = PinSchema.safeParse({ kind: "page", id: "/org/people", label: "  People  " });
    expect(result.success).toBe(true);
    if (result.success && result.data.kind === "page") expect(result.data.label).toBe("People");
  });

  it("rejects a page pin missing the label", () => {
    expect(PinSchema.safeParse({ kind: "page", id: "/org/people" }).success).toBe(false);
  });
});

describe("PinsSchema", () => {
  it("parses a mixed list of entity and page pins", () => {
    const result = PinsSchema.safeParse([
      { kind: "agent", id: "researcher" },
      { kind: "page", id: "/org/people", label: "People" },
    ]);
    expect(result.success).toBe(true);
  });
});
