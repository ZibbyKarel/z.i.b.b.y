import { ChatAboutSchema } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { noteChatAbout } from "./chatAbout";

describe("noteChatAbout", () => {
  it("stays inside the ChatAbout schema caps for a huge, multi-line note", () => {
    const about = noteChatAbout(
      { id: "notes/a.md", title: `Title\n${"x".repeat(500)}`, body: "y".repeat(30_000) },
      "core",
      "/knowledge/vault?note=a",
    );
    expect(ChatAboutSchema.parse(about)).toEqual(about);
    expect(about.details).toContain("Team: core");
  });
});
