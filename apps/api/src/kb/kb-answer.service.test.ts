import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  KbAnswerConflictError,
  KbAnswerService,
  KbQuestionNotFoundError,
  answerFileName,
} from "./kb-answer.service";
import { KbReaderService } from "./kb-reader.service";

describe("KbAnswerService", () => {
  let root: string;
  let other: string;
  const reader = new KbReaderService();
  const service = new KbAnswerService(reader);
  const kb = (): KnowledgeBaseSource => ({ kind: "vault", path: root, readOnly: true });
  const noteId = "wiki/notes/sync.md";
  const input = { noteId, question: "Kdo?", answer: "Pavel." };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "kb-answer-test-"));
    other = await fs.mkdtemp(path.join(os.tmpdir(), "kb-answer-other-"));
    await fs.mkdir(path.join(root, "wiki", "notes"), { recursive: true });
    await fs.writeFile(
      path.join(root, noteId),
      "---\ntitle: Sync\n---\n## Open questions\n- Kdo?\n",
    );
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(other, { recursive: true, force: true });
  });

  it("writes inbox note linked to the source and the digest drops the question", async () => {
    const out = await service.resolve(kb(), input, "2026-10-29");
    expect(out).toEqual({ id: `inbox/${answerFileName(noteId, "Kdo?")}`, title: "Kdo?" });
    const parsed = matter(await fs.readFile(path.join(root, out.id), "utf8"));
    expect(parsed.data).toEqual({
      title: "Kdo?",
      created: "2026-10-29",
      tags: ["answer"],
      sources: [noteId],
    });
    expect(parsed.content).toContain("Pavel.");
    expect(parsed.content).toContain("[[sync]]");
    expect((await reader.digest(kb())).questions).toEqual([]);
  });

  it("leaves the source note byte-identical", async () => {
    const before = await fs.readFile(path.join(root, noteId));
    await service.resolve(kb(), input);
    expect(await fs.readFile(path.join(root, noteId))).toEqual(before);
  });

  it("answerFileName is filename-safe and unique per source", () => {
    expect(answerFileName("a.md", "Kdo?")).toMatch(/^answer-kdo-[0-9a-f]{6}\.md$/);
    expect(answerFileName("a.md", "???")).toMatch(/^answer-question-[0-9a-f]{6}\.md$/);
    expect(answerFileName("a.md", "Kdo?")).not.toBe(answerFileName("b.md", "Kdo?"));
  });

  it("409 on a second resolve, first file untouched", async () => {
    const out = await service.resolve(kb(), input);
    await expect(service.resolve(kb(), { ...input, answer: "Second" })).rejects.toBeInstanceOf(
      KbAnswerConflictError,
    );
    expect(await fs.readFile(path.join(root, out.id), "utf8")).toContain("Pavel.");
  });

  it("404 when the question is not in the digest", async () => {
    await expect(service.resolve(kb(), { ...input, question: "Nope?" })).rejects.toBeInstanceOf(
      KbQuestionNotFoundError,
    );
    await expect(fs.lstat(path.join(root, "inbox"))).rejects.toThrow();
  });

  it("refuses a symlinked inbox", async () => {
    await fs.symlink(other, path.join(root, "inbox"));
    await expect(service.resolve(kb(), input)).rejects.toBeInstanceOf(KbAnswerConflictError);
    expect(await fs.readdir(other)).toEqual([]);
  });
});
