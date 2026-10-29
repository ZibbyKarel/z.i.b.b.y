import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import type {
  KnowledgeBaseSource,
  ResolveTeamKbQuestionInput,
  TeamKbAnswer,
} from "@zibby/contracts";
import matter from "gray-matter";
import { localDate } from "../memory/vault.service";
import { KB_ANSWER_TAG, KB_INBOX_DIR, KbReaderService } from "./kb-reader.service";

/** The question is already answered, or the KB's `inbox/` cannot be written safely (→ 409). */
export class KbAnswerConflictError extends Error {}

/** The question is not in the KB digest (→ 404). */
export class KbQuestionNotFoundError extends Error {}

/**
 * Basename of the answer note: `answer-<slug>-<6 hex>.md`. The hash covers source note + question,
 * so the same question in two notes gets two files, and re-resolving the same one collides (409).
 */
export function answerFileName(noteId: string, question: string): string {
  const slug =
    question
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "question";
  const hash = createHash("sha1").update(`${noteId}\n${question}`).digest("hex").slice(0, 6);
  return `answer-${slug}-${hash}.md`;
}

/**
 * Writes an operator's answer to an open question as ONE new note in the KB's gitignored `inbox/`.
 * The source note is never touched; the digest hides the question once the note exists.
 */
@Injectable()
export class KbAnswerService {
  constructor(private readonly reader: KbReaderService) {}

  async resolve(
    source: KnowledgeBaseSource,
    input: ResolveTeamKbQuestionInput,
    today: string = localDate(),
  ): Promise<TeamKbAnswer> {
    const inbox = path.join(path.resolve(source.path), KB_INBOX_DIR);
    const name = answerFileName(input.noteId, input.question);
    const stat = await fs.lstat(inbox).catch(() => null);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory())) {
      throw new KbAnswerConflictError(`${KB_INBOX_DIR}/ is not a plain directory`);
    }
    // Trust boundary: only a question the digest really lists (with its real source) is written.
    // An answered question is no longer listed, so its existing answer file means 409, not 404.
    const { questions } = await this.reader.digest(source);
    if (!questions.some((q) => q.noteId === input.noteId && q.text === input.question)) {
      if (await fs.lstat(path.join(inbox, name)).catch(() => null)) {
        throw new KbAnswerConflictError(`Question "${input.question}" is already answered`);
      }
      throw new KbQuestionNotFoundError(
        `Question "${input.question}" not found in ${input.noteId}`,
      );
    }

    if (!stat) await fs.mkdir(inbox, { recursive: true });

    const sourceName = path.basename(input.noteId, ".md");
    const text = matter.stringify(
      `# ${input.question}\n\n## Answer\n\n${input.answer.trim()}\n\n## Links & sources\n\n- [[${sourceName}]]\n`,
      { title: input.question, created: today, tags: [KB_ANSWER_TAG], sources: [input.noteId] },
    );
    try {
      // "wx": never overwrite an existing answer (writeFileAtomic's rename would).
      await fs.writeFile(path.join(inbox, name), text, { flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") {
        throw new KbAnswerConflictError(`Question "${input.question}" is already answered`);
      }
      throw e;
    }
    return { id: `${KB_INBOX_DIR}/${name}`, title: input.question };
  }
}
