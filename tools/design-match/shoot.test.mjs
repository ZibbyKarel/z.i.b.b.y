import net from "node:net";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertServableRoot,
  matchMount,
  normalizeMounts,
  resolveScene,
  staticUrl,
  storybookUrl,
  withStaticServer,
} from "./shoot.mjs";

/**
 * `fetch` normalises the request-target and forbids some headers, so anything
 * that probes the raw wire — an encoded traversal, a forged `Host` — has to be
 * written by hand onto a socket. No dependency: `node:net` plus a hand-rolled
 * request line is the whole thing.
 */
function rawRequest(origin, requestTarget, { method = "GET", host } = {}) {
  const { port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: Number(port) }, () => {
      socket.write(
        `${method} ${requestTarget} HTTP/1.1\r\nHost: ${host ?? `127.0.0.1:${port}`}\r\nConnection: close\r\n\r\n`,
      );
    });
    let raw = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      raw += chunk;
    });
    socket.on("error", reject);
    socket.on("close", () => {
      const [head, ...rest] = raw.split("\r\n\r\n");
      resolve({ status: Number(head.split(" ")[1]), body: rest.join("\r\n\r\n") });
    });
  });
}

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

/**
 * The floor under C1. Dropping `file://` dropped an isolation boundary, so a
 * served directory is a directory the mockup's own JavaScript can read and, via
 * its unrestricted outbound network, exfiltrate.
 */
describe("assertServableRoot", () => {
  it("accepts a directory inside the current working directory", () => {
    const inside = path.join(process.cwd(), "tools", "design-match");
    expect(assertServableRoot(inside, "test")).toBe(inside);
  });

  it("accepts the current working directory itself", () => {
    expect(assertServableRoot(process.cwd(), "test")).toBe(path.resolve(process.cwd()));
  });

  // The escalation the review found: a mockup that arrived in ~/Downloads while
  // cwd is this project. Under the old common-ancestor root that served all of
  // $HOME without a word.
  it("refuses a directory outside the current working directory", () => {
    expect(() =>
      assertServableRoot(path.join(os.homedir(), "Downloads"), "adresář mockupu"),
    ).toThrow(/design-match:.*mimo aktuální pracovní adresář/);
  });

  it("names the offending directory and the cwd so the operator can see the mismatch", () => {
    const outside = path.join(os.homedir(), "Downloads");
    expect(() => assertServableRoot(outside, "adresář mockupu")).toThrow(outside);
    expect(() => assertServableRoot(outside, "adresář mockupu")).toThrow(
      path.resolve(process.cwd()),
    );
  });

  // Not implied by the cwd test: a run whose cwd IS $HOME (or /) passes
  // containment while serving everything the operator owns.
  it("refuses the home directory even when it is the cwd", () => {
    const home = os.homedir();
    expect(() => assertServableRoot(home, "adresář mockupu", home)).toThrow(
      /design-match:.*domovský adresář/,
    );
  });

  it("refuses an ancestor of the home directory", () => {
    expect(() => assertServableRoot(path.parse(os.homedir()).root, "adresář mockupu")).toThrow(
      /design-match:/,
    );
  });

  // The floor has to decide on the path that gets mounted, and `withStaticServer`
  // mounts the realpath. A lexical check passes this and then serves $HOME —
  // and `ln -s ~/Downloads/mockups design/incoming` is the natural workaround
  // for the "inside cwd" rule this same function imposes, so the bypass is the
  // path of least resistance rather than an exotic one.
  it("refuses a symlink inside the cwd that points at the home directory", async () => {
    const inside = path.join(process.cwd(), `.design-match-symlink-test-${process.pid}`);
    await fs.symlink(os.homedir(), inside, "dir");
    try {
      // The refusal names the *resolved* home directory, not the link — which
      // is the proof that resolution happened at all. The lexical path sits
      // inside cwd and would have sailed straight through.
      expect(() => assertServableRoot(inside, "adresář mockupu")).toThrow(/^design-match:/);
      expect(() => assertServableRoot(inside, "adresář mockupu")).toThrow(
        realpathSync(os.homedir()),
      );
      expect(() => assertServableRoot(inside, "adresář mockupu")).not.toThrow(inside);
    } finally {
      await fs.rm(inside, { force: true });
    }
  });

  it("refuses a symlink inside the cwd that points outside it", async () => {
    const target = await makeTmpDir();
    const inside = path.join(process.cwd(), `.design-match-symlink-out-${process.pid}`);
    await fs.symlink(target, inside, "dir");
    try {
      expect(() => assertServableRoot(inside, "adresář mockupu")).toThrow(
        /design-match:.*mimo aktuální pracovní adresář/,
      );
    } finally {
      await fs.rm(inside, { force: true });
    }
  });

  // The other half of resolving: both operands get the same treatment, so a cwd
  // reached through a symlink (`/tmp` really is `/private/tmp` on macOS) is not
  // refused for disagreeing with itself.
  it("accepts a root under a cwd that is itself reached through a symlink", async () => {
    const real = await makeTmpDir();
    await fs.mkdir(path.join(real, "mockups"));
    const link = path.join(process.cwd(), `.design-match-symlink-cwd-${process.pid}`);
    await fs.symlink(real, link, "dir");
    try {
      expect(assertServableRoot(path.join(link, "mockups"), "adresář mockupu", link)).toBe(
        path.join(real, "mockups"),
      );
    } finally {
      await fs.rm(link, { force: true });
    }
  });

  // A root that does not exist cannot be a symlink to anywhere, so it keeps its
  // lexical form and reaches `withStaticServer`, whose "cannot open" message
  // names the real problem. Resolving must not turn that into a confusing
  // containment complaint.
  it("passes a non-existent directory through on its lexical path", () => {
    const missing = path.join(process.cwd(), "tools", "design-match", "no-such-dir");
    expect(assertServableRoot(missing, "test")).toBe(missing);
  });
});

describe("normalizeMounts / matchMount", () => {
  const mounts = normalizeMounts({ "/": "/mockup", "/__design-match-cdn": "/cache" });

  it("orders named mounts before the root mount so the root cannot swallow them", () => {
    expect(mounts.map((m) => m.prefix)).toEqual(["/__design-match-cdn", ""]);
  });

  it("routes a cache path to the cache directory", () => {
    expect(matchMount(mounts, "/__design-match-cdn/abc.css")).toEqual({
      root: "/cache",
      relative: "abc.css",
    });
  });

  it("routes everything else to the mockup directory", () => {
    expect(matchMount(mounts, "/zibby/data.jsx")).toEqual({
      root: "/mockup",
      relative: "zibby/data.jsx",
    });
  });

  // The prefix must not match a sibling directory whose name merely starts the
  // same way — that would silently serve cache files out of the mockup mount.
  it("does not treat a path that merely starts with the prefix as a mount hit", () => {
    expect(matchMount(mounts, "/__design-match-cdn-other/x.css")).toEqual({
      root: "/mockup",
      relative: "__design-match-cdn-other/x.css",
    });
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

    const seen = await withStaticServer({ "/": root }, async (origin) => {
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

    const body = await withStaticServer({ "/": root }, async (origin) => {
      const url = staticUrl(origin, root, path.join(root, "Z.I.B.B.Y", "ZIBBY Archiv úloh.html"));
      const response = await fetch(url);
      return response.text();
    });

    expect(body).toBe("ok");
  });

  it("answers 404 for a file that is not there", async () => {
    const root = await makeTmpDir();
    const status = await withStaticServer({ "/": root }, async (origin) => {
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

    const seen = await withStaticServer({ "/": root }, async (origin) => {
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
    const origin = await withStaticServer({ "/": root }, async (served) => served);

    await expect(fetch(`${origin}/page.html`)).rejects.toThrow();
  });

  // A crash inside the run must not leak a listening socket for the rest of
  // the process's life.
  it("stops listening even when the callback throws, and lets the original error through", async () => {
    const root = await makeTmpDir();
    let origin;
    await expect(
      withStaticServer({ "/": root }, async (served) => {
        origin = served;
        throw new Error("design-match: boom");
      }),
    ).rejects.toThrow("design-match: boom");

    await expect(fetch(`${origin}/page.html`)).rejects.toThrow();
  });
});

describe("withStaticServer — mounts and the controls around them", () => {
  it("serves a second mount from a directory that is nowhere near the first", async () => {
    const mockupDir = await makeTmpDir();
    const cacheDir = await makeTmpDir();
    await fs.writeFile(path.join(mockupDir, "page.html"), "<p>ahoj</p>", "utf8");
    await fs.writeFile(path.join(cacheDir, "abc.css"), "body{color:red}", "utf8");

    const seen = await withStaticServer(
      { "/": mockupDir, "/__design-match-cdn": cacheDir },
      async (origin) => {
        const page = await fetch(`${origin}/page.html`);
        const css = await fetch(`${origin}/__design-match-cdn/abc.css`);
        return {
          page: await page.text(),
          css: await css.text(),
          cssType: css.headers.get("content-type"),
        };
      },
    );

    expect(seen).toEqual({
      page: "<p>ahoj</p>",
      css: "body{color:red}",
      cssType: "text/css; charset=utf-8",
    });
  });

  // I2: this is the check that had no test at all. The pre-filesystem
  // containment check cannot see a symlink, because the path it inspects is
  // entirely inside the root — only the post-realpath check can.
  it("refuses a symlink inside the root that points at a file outside it", async () => {
    const root = await makeTmpDir();
    const elsewhere = await makeTmpDir();
    const secretFile = path.join(elsewhere, "secret.txt");
    await fs.writeFile(secretFile, "SECRET-VALUE", "utf8");
    await fs.symlink(secretFile, path.join(root, "link.txt"));

    const seen = await withStaticServer({ "/": root }, async (origin) =>
      rawRequest(origin, "/link.txt"),
    );

    expect(seen.status).toBe(403);
    expect(seen.body).not.toContain("SECRET-VALUE");
  });

  it("refuses a symlinked directory inside the root that points outside it", async () => {
    const root = await makeTmpDir();
    const elsewhere = await makeTmpDir();
    await fs.writeFile(path.join(elsewhere, "secret.txt"), "SECRET-VALUE", "utf8");
    await fs.symlink(elsewhere, path.join(root, "linkdir"));

    const seen = await withStaticServer({ "/": root }, async (origin) =>
      rawRequest(origin, "/linkdir/secret.txt"),
    );

    expect(seen.status).toBe(403);
    expect(seen.body).not.toContain("SECRET-VALUE");
  });

  // I4: without a Host check, the only thing between a page in the operator's
  // own browser and the served tree is guessing the ephemeral port.
  it("refuses a request carrying a Host it never advertised", async () => {
    const root = await makeTmpDir();
    await fs.writeFile(path.join(root, "ok.txt"), "PLAIN-CONTENT", "utf8");

    const { allowed, forged, byName } = await withStaticServer({ "/": root }, async (origin) => ({
      allowed: await rawRequest(origin, "/ok.txt"),
      forged: await rawRequest(origin, "/ok.txt", { host: "evil.example" }),
      byName: await rawRequest(origin, "/ok.txt", {
        host: `localhost:${new URL(origin).port}`,
      }),
    }));

    expect(allowed.status).toBe(200);
    expect(byName.status).toBe(200);
    expect(forged.status).toBe(403);
    expect(forged.body).not.toContain("PLAIN-CONTENT");
  });

  // M8: both were correct and both unpinned.
  it("refuses a method other than GET or HEAD", async () => {
    const root = await makeTmpDir();
    await fs.writeFile(path.join(root, "ok.txt"), "ok", "utf8");
    const status = await withStaticServer({ "/": root }, async (origin) => {
      const response = await fetch(`${origin}/ok.txt`, { method: "POST" });
      return response.status;
    });
    expect(status).toBe(405);
  });

  it("answers 404 for a directory rather than listing it", async () => {
    const root = await makeTmpDir();
    await fs.mkdir(path.join(root, "sub"));
    const status = await withStaticServer({ "/": root }, async (origin) => {
      const response = await fetch(`${origin}/sub`);
      return response.status;
    });
    expect(status).toBe(404);
  });

  // M4: a missing mount directory is an operator-caused condition, so it gets
  // the one-line treatment rather than a bare ENOENT stack.
  it("refuses a mount directory that does not exist with a design-match: line", async () => {
    const root = await makeTmpDir();
    await expect(
      withStaticServer({ "/": path.join(root, "nope") }, async () => undefined),
    ).rejects.toThrow(/^design-match:/);
  });
});
