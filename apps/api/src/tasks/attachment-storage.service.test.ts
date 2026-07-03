import { beforeEach, describe, expect, it } from "vitest";
import { AttachmentStorageService } from "./attachment-storage.service";
import * as fs from "node:fs/promises";
import * as path from "node:path";

function file(name: string, body: string) {
  return { originalname: name, size: body.length, mimetype: "text/plain", buffer: Buffer.from(body) };
}

describe("AttachmentStorageService", () => {
  let svc: AttachmentStorageService;
  beforeEach(() => { svc = new AttachmentStorageService(); });

  it("saves files and returns an absolute set dir + metadata", async () => {
    const { attachmentSetId, files } = await svc.save([file("a.txt", "hello"), file("b.csv", "x,y")]);
    expect(files).toEqual([
      { name: "a.txt", size: 5, mediaType: "text/plain" },
      { name: "b.csv", size: 3, mediaType: "text/plain" },
    ]);
    const dir = svc.dir(attachmentSetId);
    expect(path.isAbsolute(dir)).toBe(true);
    expect(await fs.readFile(path.join(dir, "a.txt"), "utf8")).toBe("hello");
  });

  it("sanitizes filenames to a basename", async () => {
    const { attachmentSetId, files } = await svc.save([file("../../etc/passwd", "x")]);
    expect(files[0]?.name).toBe("passwd");
    const entries = await fs.readdir(svc.dir(attachmentSetId));
    expect(entries).toEqual(["meta.json", "passwd"]);
  });

  it("lists and removes a set", async () => {
    const { attachmentSetId } = await svc.save([file("a.txt", "hi")]);
    expect(await svc.list(attachmentSetId)).toHaveLength(1);
    await svc.remove(attachmentSetId);
    expect(await svc.list(attachmentSetId)).toEqual([]);
  });
});
