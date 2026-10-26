import { describe, expect, it } from "vitest";
import { AddMarketplaceInputSchema, MarketplaceDetailSchema } from "./marketplace.schema";
import { marketplacesContract } from "./marketplaces.contract";

describe("AddMarketplaceInputSchema", () => {
  it("trims the source", () => {
    expect(AddMarketplaceInputSchema.parse({ source: "  a/b ", devMode: false }).source).toBe(
      "a/b",
    );
  });

  it("rejects a whitespace-only source", () => {
    expect(AddMarketplaceInputSchema.safeParse({ source: "  ", devMode: true }).success).toBe(
      false,
    );
  });
});

describe("MarketplaceDetailSchema", () => {
  it("accepts a detail with one plugin", () => {
    const detail = {
      id: "zibby-skills",
      source: "/repo",
      devMode: true,
      localPath: "/repo",
      managedClone: false,
      addedAt: "2026-10-26T10:00:00.000Z",
      plugins: [
        {
          name: "zibby",
          installed: true,
          linked: true,
          skills: [{ name: "standup-post", description: "Post the standup" }],
          agents: [],
          commands: [],
          hooks: false,
          mcpServers: [],
        },
      ],
    };
    expect(MarketplaceDetailSchema.safeParse(detail).success).toBe(true);
  });
});

describe("marketplacesContract", () => {
  it("exposes the marketplace routes under /api", () => {
    expect(marketplacesContract.installPlugin.path).toBe(
      "/api/marketplaces/:id/plugins/:plugin/install",
    );
    expect(marketplacesContract.listMarketplaceSkills.path).toBe("/api/marketplace-skills");
  });
});
