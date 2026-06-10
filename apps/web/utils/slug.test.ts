import { describe, expect, it } from "vitest";
import { slug } from "./slug";

describe("slug", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slug("Hello World!")).toBe("hello-world");
  });

  it("strips diacritics", () => {
    expect(slug("Nový žlutý kůň")).toBe("novy-zluty-kun");
  });

  it("collapses runs and trims edge dashes", () => {
    expect(slug("  --a  &  b--  ")).toBe("a-b");
  });

  it("returns the empty string by default when nothing survives", () => {
    expect(slug("  ??? ")).toBe("");
  });

  it("returns the fallback when nothing survives and one is given", () => {
    expect(slug("", "novy")).toBe("novy");
  });
});
