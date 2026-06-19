import { describe, expect, it } from "vitest";
import { credentialMatchesKind } from "./credential-kind";

describe("credentialMatchesKind", () => {
  it("email requires a password (matches the email adapter's passwordOf)", () => {
    expect(credentialMatchesKind("email", { password: "p" })).toBe(true);
    expect(credentialMatchesKind("email", { token: "t" })).toBe(false);
  });

  it("slack/jira/github require a token (matches each adapter's tokenOf)", () => {
    for (const kind of ["slack", "jira", "github"] as const) {
      expect(credentialMatchesKind(kind, { token: "t" })).toBe(true);
      expect(credentialMatchesKind(kind, { password: "p" })).toBe(false);
    }
  });
});
