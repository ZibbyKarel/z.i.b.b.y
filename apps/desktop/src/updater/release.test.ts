import { describe, expect, it } from "vitest";
import { compareVersions, parseSha256File, parseVersion, pickUpdate } from "./release";

function release(
  tag: string,
  opts: { draft?: boolean; prerelease?: boolean; assets?: string[] } = {},
) {
  const version = tag.replace(/^desktop-v/, "");
  const names = opts.assets ?? [
    `ZibbyOS-${version}-arm64.zip`,
    `ZibbyOS-${version}-arm64.zip.sha256`,
  ];
  return {
    tag_name: tag,
    draft: opts.draft ?? false,
    prerelease: opts.prerelease ?? false,
    body: `notes ${version}`,
    html_url: `https://github.com/x/y/releases/tag/${tag}`,
    assets: names.map((name) => ({
      name,
      browser_download_url: `https://dl/${name}`,
      size: 100,
    })),
  };
}

describe("parseVersion / compareVersions", () => {
  it("parses x.y.z with or without a v prefix", () => {
    expect(parseVersion("0.2.10")).toEqual([0, 2, 10]);
    expect(parseVersion("v1.0.0")).toEqual([1, 0, 0]);
  });

  it("rejects anything that is not exactly three numbers", () => {
    expect(parseVersion("0.1")).toBeUndefined();
    expect(parseVersion("1.0.0-beta")).toBeUndefined();
  });

  it("compares numerically, not lexically", () => {
    expect(compareVersions([0, 10, 0], [0, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([1, 0, 0], [1, 0, 0])).toBe(0);
  });
});

describe("pickUpdate", () => {
  it("picks the newest desktop release above the current version", () => {
    const update = pickUpdate(
      [release("desktop-v0.2.0"), release("desktop-v0.3.0"), release("desktop-v0.1.0")],
      "0.1.0",
      "arm64",
    );
    expect(update?.version).toBe("0.3.0");
    expect(update?.zipUrl).toBe("https://dl/ZibbyOS-0.3.0-arm64.zip");
    expect(update?.sha256Url).toBe("https://dl/ZibbyOS-0.3.0-arm64.zip.sha256");
    expect(update?.notes).toBe("notes 0.3.0");
  });

  it("returns nothing when the current version is the newest", () => {
    expect(pickUpdate([release("desktop-v0.1.0")], "0.1.0", "arm64")).toBeUndefined();
  });

  it("ignores drafts, prereleases and tags outside the desktop prefix", () => {
    const releases = [
      release("desktop-v0.5.0", { draft: true }),
      release("desktop-v0.4.0", { prerelease: true }),
      { ...release("desktop-v3.0.0"), tag_name: "v3.0" },
    ];
    expect(pickUpdate(releases, "0.1.0", "arm64")).toBeUndefined();
  });

  it("skips a release without a zip and checksum for this arch", () => {
    const releases = [
      release("desktop-v0.3.0", { assets: ["ZibbyOS-0.3.0-arm64.zip"] }),
      release("desktop-v0.2.0"),
    ];
    expect(pickUpdate(releases, "0.1.0", "arm64")?.version).toBe("0.2.0");
    expect(pickUpdate([release("desktop-v0.2.0")], "0.1.0", "x64")).toBeUndefined();
  });

  it("tolerates garbage input", () => {
    expect(pickUpdate({ message: "rate limited" }, "0.1.0", "arm64")).toBeUndefined();
    expect(pickUpdate([null, 1, "x"], "0.1.0", "arm64")).toBeUndefined();
  });
});

describe("parseSha256File", () => {
  it("reads the hash from shasum output", () => {
    const hex = "a".repeat(64);
    expect(parseSha256File(`${hex}  ZibbyOS-0.2.0-arm64.zip\n`)).toBe(hex);
  });

  it("rejects malformed content", () => {
    expect(parseSha256File("not a hash")).toBeUndefined();
  });
});
