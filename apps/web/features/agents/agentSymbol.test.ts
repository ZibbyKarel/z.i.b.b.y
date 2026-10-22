import type { Department } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { agentSymbol } from "./agentSymbol";

const dev = { id: "dev", icon: "code", color: "#5b8def" } as Department;
const misc = { id: "misc", icon: "folder", color: "#111111" } as Department;

describe("agentSymbol", () => {
  it("prefers the agent glyph and tints with the department colour", () => {
    expect(agentSymbol({ glyph: "flask", department: "dev" }, [dev])).toEqual({
      glyph: "flask",
      color: "#5b8def",
    });
  });
  it("falls back to the department icon, then bot", () => {
    expect(agentSymbol({ department: "dev" }, [dev]).glyph).toBe("code");
    expect(agentSymbol({ department: "misc" }, [misc]).glyph).toBe("bot");
    expect(agentSymbol(undefined, [dev])).toEqual({ glyph: "bot", color: undefined });
  });
  it("ignores a glyph that is not a DS icon", () => {
    expect(agentSymbol({ glyph: "nope", department: "dev" }, [dev]).glyph).toBe("code");
  });
});
