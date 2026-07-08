import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AvatarAssetStore } from "./avatar-asset-store";

// A tiny valid-looking base64 payload; content doesn't need to be a real image
// for these tests — only the data-URI shape and round-trip bytes matter.
const PNG_DATA_URI = "data:image/png;base64,aGVsbG8gd29ybGQ="; // "hello world"
const JPEG_DATA_URI = "data:image/jpeg;base64,c2Vjb25kIGltYWdl"; // "second image"

describe("AvatarAssetStore", () => {
  let dir: string;
  let store: AvatarAssetStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "avatar-asset-test-"));
    store = new AvatarAssetStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("parseDataUri", () => {
    it("parses a data:image/png;base64 URI", () => {
      const parsed = store.parseDataUri(PNG_DATA_URI);
      expect(parsed).not.toBeNull();
      expect(parsed?.mime).toBe("image/png");
      expect(parsed?.ext).toBe("png");
      expect(parsed?.bytes.toString("utf8")).toBe("hello world");
    });

    it("derives the extension from the mime type", () => {
      expect(store.parseDataUri(JPEG_DATA_URI)?.ext).toBe("jpg");
      expect(store.parseDataUri("data:image/webp;base64,YQ==")?.ext).toBe("webp");
      expect(store.parseDataUri("data:image/svg+xml;base64,YQ==")?.ext).toBe("svg");
      expect(store.parseDataUri("data:image/gif;base64,YQ==")?.ext).toBe("gif");
    });

    it("falls back to png for an unrecognized image mime", () => {
      expect(store.parseDataUri("data:image/tiff;base64,YQ==")?.ext).toBe("png");
    });

    it("returns null for a non-data-URI (e.g. a bundled /avatars/*.png path)", () => {
      expect(store.parseDataUri("/avatars/architect.png")).toBeNull();
    });

    it("returns null for a non-image data URI", () => {
      expect(store.parseDataUri("data:text/plain;base64,aGk=")).toBeNull();
    });
  });

  describe("externalize / inlineSync round-trip", () => {
    it("writes assets/<id>.<ext> and returns the bare reference", async () => {
      const ref = await store.externalize("agent-1", PNG_DATA_URI);
      expect(ref).toBe("assets/agent-1.png");
      const bytes = await fs.readFile(path.join(dir, "assets", "agent-1.png"));
      expect(bytes.toString("utf8")).toBe("hello world");
    });

    it("inlineSync round-trips the exact same data URI", async () => {
      const ref = await store.externalize("agent-2", PNG_DATA_URI);
      expect(ref).not.toBeNull();
      const inlined = store.inlineSync(ref as string);
      expect(inlined).toBe(PNG_DATA_URI);
    });

    it("round-trips a jpeg avatar with the right mime on the way back", async () => {
      const ref = await store.externalize("agent-3", JPEG_DATA_URI);
      expect(ref).toBe("assets/agent-3.jpg");
      expect(store.inlineSync(ref as string)).toBe(JPEG_DATA_URI);
    });

    it("returns null and writes nothing for a non-data-URI value", async () => {
      const ref = await store.externalize("agent-4", "/avatars/x.png");
      expect(ref).toBeNull();
      await expect(fs.readdir(path.join(dir, "assets")).catch(() => [])).resolves.not.toContain(
        "agent-4.png",
      );
    });

    it("cleans up a stale asset written under a different extension", async () => {
      const first = await store.externalize("agent-5", PNG_DATA_URI);
      expect(first).toBe("assets/agent-5.png");

      const second = await store.externalize("agent-5", JPEG_DATA_URI);
      expect(second).toBe("assets/agent-5.jpg");

      const entries = await fs.readdir(path.join(dir, "assets"));
      expect(entries).toContain("agent-5.jpg");
      expect(entries).not.toContain("agent-5.png");
    });
  });

  describe("inlineSync guards", () => {
    it("returns null when the asset file does not exist", () => {
      expect(store.inlineSync("assets/ghost.png")).toBeNull();
    });

    it("rejects a ref with a nested path segment", () => {
      expect(store.inlineSync("assets/../secret.png")).toBeNull();
      expect(store.inlineSync("assets/sub/dir.png")).toBeNull();
    });

    it("rejects a ref that is a bare `..` (still passes the character-class regex)", () => {
      expect(store.inlineSync("assets/..")).toBeNull();
    });

    it("rejects an absolute path disguised as a ref", () => {
      expect(store.inlineSync("/etc/passwd")).toBeNull();
    });

    it("rejects a value that isn't even asset-shaped", () => {
      expect(store.inlineSync("not-an-asset-ref")).toBeNull();
      expect(store.inlineSync(PNG_DATA_URI)).toBeNull();
    });

    it("does not read a real file placed just outside the assets dir via traversal", async () => {
      const secret = path.join(dir, "secret.png");
      await fs.writeFile(secret, "top secret bytes", "utf8");
      try {
        expect(store.inlineSync("assets/../secret.png")).toBeNull();
      } finally {
        await fs.rm(secret, { force: true });
      }
    });
  });

  describe("isAssetRef", () => {
    it("is true only for assets/-prefixed values", () => {
      expect(store.isAssetRef("assets/x.png")).toBe(true);
      expect(store.isAssetRef("/avatars/x.png")).toBe(false);
      expect(store.isAssetRef(PNG_DATA_URI)).toBe(false);
    });
  });

  describe("remove", () => {
    it("unlinks the asset file", async () => {
      await store.externalize("agent-6", PNG_DATA_URI);
      await store.remove("agent-6");
      expect(store.inlineSync("assets/agent-6.png")).toBeNull();
      const entries = await fs.readdir(path.join(dir, "assets"));
      expect(entries).not.toContain("agent-6.png");
    });

    it("is tolerant of removing an asset that was never written", async () => {
      await expect(store.remove("never-existed")).resolves.toBeUndefined();
    });
  });
});
