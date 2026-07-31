import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  commonAncestorDir,
  resolveScene,
  staticUrl,
  storybookUrl,
  withStaticServer,
} from "./shoot.mjs";

let tmpDirs = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function makeTmpDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "design-match-serve-"));
  tmpDirs.push(await fs.realpath(dir));
  return tmpDirs.at(-1);
}

describe("storybookUrl", () => {
  it("builds an iframe url so the Storybook chrome is not in the shot", () => {
    expect(storybookUrl("components-button--primary")).toBe(
      "http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story",
    );
  });
});

describe("resolveScene", () => {
  it("prefers the story mode when a story id is given", () => {
    const scene = resolveScene({ story: "ds-card--default", selector: "#storybook-root > *" });
    expect(scene.mode).toBe("story");
    expect(scene.url).toContain("id=ds-card--default");
  });

  it("uses the route mode with the app base url", () => {
    const scene = resolveScene({ route: "/roadmap", selector: "[data-region=card]" });
    expect(scene).toMatchObject({ mode: "route", url: "http://localhost:3000/roadmap" });
  });

  it("switches to mask mode when masks are supplied and records them", () => {
    const scene = resolveScene({ route: "/roadmap", selector: "main", masks: [".relative-time"] });
    expect(scene.mode).toBe("mask");
    expect(scene.masks).toEqual([".relative-time"]);
  });

  it("throws when neither story nor route is given", () => {
    expect(() => resolveScene({ selector: "main" })).toThrow(/--story|--route/);
  });

  // Pinning the brief's asymmetry: a story scene's masks are still recorded and
  // will still be applied by shootScene, but the mode stays "story" rather than
  // flipping to "mask" the way a route's masks do. This is documented behaviour,
  // not an oversight — see task-10-brief.md ruling 3.
  it("pins the asymmetry: masks alongside a story leave mode as story but still record the masks", () => {
    const scene = resolveScene({
      story: "ds-card--default",
      selector: "#storybook-root > *",
      masks: [".relative-time"],
    });
    expect(scene.mode).toBe("story");
    expect(scene.masks).toEqual([".relative-time"]);
  });

  // Fix round 1, Minor: a route typed without a leading slash used to concatenate
  // straight onto appBase with no separator (`http://localhost:3000roadmap`) —
  // no error, just a URL that will never resolve. Normalise to one leading slash.
  it("normalises a route given without a leading slash so it doesn't collide with appBase", () => {
    const scene = resolveScene({ route: "roadmap", selector: "main" });
    expect(scene.url).toBe("http://localhost:3000/roadmap");
  });
});

describe("commonAncestorDir", () => {
  it("returns the deepest directory that contains every path", () => {
    expect(
      commonAncestorDir([path.join("/a", "b", "c", "page.html"), path.join("/a", "b", "d")]),
    ).toBe(path.join("/a", "b"));
  });

  it("returns the ancestor itself when one path already contains the other", () => {
    expect(commonAncestorDir([path.join("/a", "b"), path.join("/a", "b", "c", "d")])).toBe(
      path.join("/a", "b"),
    );
  });

  // Serving the filesystem root over http, even read-only on loopback, is not
  // something this tool should ever do silently.
  it("refuses when the only shared ancestor is the filesystem root", () => {
    expect(() => commonAncestorDir(["/alpha/one", "/beta/two"])).toThrow(/design-match:/);
  });
});

describe("staticUrl", () => {
  it("percent-encodes each segment so a mockup with spaces and diacritics resolves", () => {
    const url = staticUrl(
      "http://127.0.0.1:1234",
      path.join("/root"),
      path.join("/root", "design", "ZIBBY Archiv úloh.html"),
    );
    expect(url).toBe("http://127.0.0.1:1234/design/ZIBBY%20Archiv%20%C3%BAloh.html");
  });
});

describe("withStaticServer", () => {
  it("serves a file from the root on loopback and hands the origin to the callback", async () => {
    const root = await makeTmpDir();
    await fs.writeFile(path.join(root, "page.html"), "<p>ahoj</p>", "utf8");

    const seen = await withStaticServer(root, async (origin) => {
      expect(origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      const response = await fetch(`${origin}/page.html`);
      return {
        status: response.status,
        type: response.headers.get("content-type"),
        body: await response.text(),
      };
    });

    expect(seen).toEqual({ status: 200, type: "text/html; charset=utf-8", body: "<p>ahoj</p>" });
  });

  it("serves a nested file with spaces and diacritics in its path", async () => {
    const root = await makeTmpDir();
    await fs.mkdir(path.join(root, "Z.I.B.B.Y"), { recursive: true });
    await fs.writeFile(path.join(root, "Z.I.B.B.Y", "ZIBBY Archiv úloh.html"), "ok", "utf8");

    const body = await withStaticServer(root, async (origin) => {
      const url = staticUrl(origin, root, path.join(root, "Z.I.B.B.Y", "ZIBBY Archiv úloh.html"));
      const response = await fetch(url);
      return response.text();
    });

    expect(body).toBe("ok");
  });

  it("answers 404 for a file that is not there", async () => {
    const root = await makeTmpDir();
    const status = await withStaticServer(root, async (origin) => {
      const response = await fetch(`${origin}/missing.html`);
      return response.status;
    });
    expect(status).toBe(404);
  });

  // The URL parser normalises a literal `..` segment away before the request
  // is ever sent, so that form cannot reach the handler. An encoded SLASH is
  // the form that survives: `..%2fx` is one opaque segment to the URL parser
  // and only becomes `../x` when the handler percent-decodes it. That is the
  // path the containment check actually has to hold.
  it("refuses a traversal out of the root smuggled through an encoded slash", async () => {
    const root = await makeTmpDir();
    const outside = path.join(root, "..", `outside-${path.basename(root)}.txt`);
    await fs.writeFile(outside, "secret", "utf8");

    const seen = await withStaticServer(root, async (origin) => {
      const response = await fetch(`${origin}/..%2f${path.basename(outside)}`);
      return { status: response.status, body: await response.text() };
    });

    await fs.rm(outside, { force: true });
    expect(seen.status).toBe(403);
    expect(seen.body).not.toContain("secret");
  });

  it("stops listening once the callback resolves", async () => {
    const root = await makeTmpDir();
    await fs.writeFile(path.join(root, "page.html"), "ok", "utf8");
    const origin = await withStaticServer(root, async (served) => served);

    await expect(fetch(`${origin}/page.html`)).rejects.toThrow();
  });

  // A crash inside the run must not leak a listening socket for the rest of
  // the process's life.
  it("stops listening even when the callback throws, and lets the original error through", async () => {
    const root = await makeTmpDir();
    let origin;
    await expect(
      withStaticServer(root, async (served) => {
        origin = served;
        throw new Error("design-match: boom");
      }),
    ).rejects.toThrow("design-match: boom");

    await expect(fetch(`${origin}/page.html`)).rejects.toThrow();
  });
});
