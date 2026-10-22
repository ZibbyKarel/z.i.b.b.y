"use client";

import type { InboxPrThread, PrThreadOutcome } from "@zibby/contracts";
import {
  Button,
  Card,
  Checkbox,
  DiffView,
  Markdown,
  Stack,
  Tag,
  TextAreaField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useElapsedLabel } from "../../useElapsedLabel";

export enum ReviewThreadTestId {
  Root = "review-thread-root",
  File = "review-thread-file",
  OutcomeTag = "review-thread-outcome-tag",
  OutdatedTag = "review-thread-outdated-tag",
  NewTag = "review-thread-new-tag",
  Snippet = "review-thread-snippet",
  Comment = "review-thread-comment",
  ReplyInput = "review-thread-reply-input",
  Resolve = "review-thread-resolve",
  Send = "review-thread-send",
}

export interface ReviewThreadReply {
  body: string;
  resolve: boolean;
  onChange(next: { body: string; resolve: boolean }): void;
  onSend?(): void;
  sending?: boolean;
}

export interface ReviewThreadProps {
  thread: InboxPrThread;
  outcome?: PrThreadOutcome;
  /** The thread appeared since the agent's run. */
  isNew?: boolean;
  /** Absent → read-only (resolved or no longer open). */
  reply?: ReviewThreadReply;
  /** Epoch ms used for the relative comment ages. */
  now: number;
}

const SNIPPET_LINES = 4;

/** The hunk without its `@@` header, last 4 lines (the last one is the commented line). */
function snippetOf(diffHunk: string): string {
  return diffHunk
    .replace(/\n+$/, "")
    .split("\n")
    .filter((l) => !l.startsWith("@@"))
    .slice(-SNIPPET_LINES)
    .join("\n");
}

/** One GitHub review thread: file, code context, comments and an optional reply box. */
export function ReviewThread({ thread, outcome, isNew, reply, now }: ReviewThreadProps) {
  const t = useTranslations("inboxPage.threads");
  const elapsed = useElapsedLabel();
  const outcomeTone = { done: "done", skipped: "neutral", question: "blocked" } as const;
  const outcomeLabel = outcome
    ? outcome.kind === "done"
      ? t("outcome.done", { note: outcome.note })
      : t(`outcome.${outcome.kind}`)
    : null;

  return (
    <Card data-testid={ReviewThreadTestId.Root}>
      <Stack gap="200">
        <Stack wrap align="center" gap="150">
          <Typography mono data-testid={ReviewThreadTestId.File} type="data">
            {thread.line === null ? thread.path : `${thread.path}:${thread.line}`}
          </Typography>
          {outcome && outcomeLabel ? (
            <Tag data-testid={ReviewThreadTestId.OutcomeTag} tone={outcomeTone[outcome.kind]}>
              {outcomeLabel}
            </Tag>
          ) : null}
          {thread.isOutdated ? (
            <Tag data-testid={ReviewThreadTestId.OutdatedTag} tone="neutral">
              {t("outdated")}
            </Tag>
          ) : null}
          {isNew ? (
            <Tag data-testid={ReviewThreadTestId.NewTag} tone="thinking">
              {t("new")}
            </Tag>
          ) : null}
        </Stack>
        <div data-testid={ReviewThreadTestId.Snippet}>
          <DiffView unified={snippetOf(thread.diffHunk)} />
        </div>
        {thread.comments.map((c) => (
          <Stack data-testid={ReviewThreadTestId.Comment} gap="100" key={c.id}>
            <Typography mono type="note" variant="secondary">
              {t("comment", {
                login: c.author?.login ?? t("unknownAuthor"),
                age: elapsed(c.createdAt, now),
              })}
            </Typography>
            <Markdown escapeHtml source={c.body} />
          </Stack>
        ))}
        {reply ? (
          <Stack gap="150">
            <TextAreaField
              data-testid={ReviewThreadTestId.ReplyInput}
              label={t("reply")}
              onChange={(e) => reply.onChange({ body: e.target.value, resolve: reply.resolve })}
              value={reply.body}
            />
            <Stack align="center" gap="150" justify="between">
              <label>
                <Stack align="center" gap="100">
                  <Checkbox
                    checked={reply.resolve}
                    data-testid={ReviewThreadTestId.Resolve}
                    label={t("resolve")}
                    onChange={(next) => reply.onChange({ body: reply.body, resolve: next })}
                  />
                  <Typography aria-hidden="true" as="span" type="note">
                    {t("resolve")}
                  </Typography>
                </Stack>
              </label>
              {reply.onSend ? (
                <Button
                  data-testid={ReviewThreadTestId.Send}
                  disabled={(!reply.body.trim() && !reply.resolve) || reply.sending}
                  loading={reply.sending}
                  onClick={reply.onSend}
                >
                  {t("send")}
                </Button>
              ) : null}
            </Stack>
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
