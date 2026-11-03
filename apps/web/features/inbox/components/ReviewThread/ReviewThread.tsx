"use client";

import type { InboxPrThread, PrThreadOutcome } from "@zibby/contracts";
import {
  Avatar,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  FileDiffView,
  HighlightTextAreaField,
  InputFrame,
  Markdown,
  Row,
  type Spacing,
  Stack,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { threadChatAbout } from "../../../chat/chatAbout";
import { ChatAboutButton } from "../../../chat/components/ChatAboutButton";
import { useElapsedLabel } from "../../useElapsedLabel";

export enum ReviewThreadTestId {
  Root = "review-thread-root",
  File = "review-thread-file",
  FileLink = "review-thread-file-link",
  CopyLink = "review-thread-copy-link",
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
  /** `owner/repo#N` of the PR — only context for the "talk it over in chat" reference. */
  prRef?: string;
}

const SNIPPET_LINES = 4;
/** Vertical / horizontal padding of the thread — the reply input reuses it. */
export const THREAD_PADDING: [Spacing, Spacing] = ["125", "250"];

/**
 * The last 4 lines of the thread's diff hunk (the last one is the commented line) as a one-file
 * unified diff for `FileDiffView`; the `@@` header is re-based so its line numbers stay right.
 */
export function snippetDiff(path: string, diffHunk: string): string {
  const [header = "", ...rest] = diffHunk.replace(/\n+$/, "").split("\n");
  const lines = rest.filter((l) => !l.startsWith("@@"));
  const kept = lines.slice(-SNIPPET_LINES);
  const skipped = lines.slice(0, lines.length - kept.length);
  const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(header);
  const count = (ls: string[], sign: "+" | "-") =>
    ls.filter((l) => !l.startsWith(sign) && !l.startsWith("\\")).length;
  const oldStart = Number(m?.[1] ?? 1) + count(skipped, "+");
  const newStart = Number(m?.[2] ?? 1) + count(skipped, "-");
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${oldStart},${count(kept, "+")} +${newStart},${count(kept, "-")} @@`,
    ...kept,
  ].join("\n");
}

/**
 * The thread's `path:line`, linked to the thread on GitHub; a copy-link button shows on
 * hover / keyboard focus. Without a URL it is plain text.
 */
function ThreadFile({ label, url }: { label: string; url?: string }) {
  const t = useTranslations("inboxPage.threads");
  const [active, setActive] = useState(false);
  const text = (
    <Typography mono data-testid={ReviewThreadTestId.File} type="data">
      {label}
    </Typography>
  );
  if (!url) return text;
  return (
    <div
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setActive(false);
      }}
      onFocus={() => setActive(true)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      <Row gap="75">
        <TextLink
          aria-label={t("openOnGithub")}
          data-testid={ReviewThreadTestId.FileLink}
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {text}
        </TextLink>
        {active ? (
          <Button
            aria-label={t("copyLink")}
            data-testid={ReviewThreadTestId.CopyLink}
            icon="copy"
            intent="ghost"
            onClick={() => void navigator.clipboard?.writeText(url)}
            size="sm"
            title={t("copyLink")}
          />
        ) : null}
      </Row>
    </div>
  );
}

/** One GitHub review thread: file, code context, comments and an optional reply box. */
export function ReviewThread({ thread, outcome, isNew, reply, now, prRef }: ReviewThreadProps) {
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
      <CardContent padding={THREAD_PADDING}>
        <Stack gap="200">
          <Row wrap gap="150" justify="between">
            <ThreadFile
              label={thread.line === null ? thread.path : `${thread.path}:${thread.line}`}
              url={thread.url}
            />
            <Row wrap gap="100">
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
            </Row>
          </Row>
          <div data-testid={ReviewThreadTestId.Snippet}>
            <FileDiffView diff={snippetDiff(thread.path, thread.diffHunk)} showFileName={false} />
          </div>
          {thread.comments.map((c) => (
            <Stack data-testid={ReviewThreadTestId.Comment} gap="50" key={c.id}>
              <Row gap="100">
                <Avatar name={c.author?.login ?? t("unknownAuthor")} src={c.author?.avatarUrl} />
                <Typography type="labelSm">{c.author?.login ?? t("unknownAuthor")}</Typography>
                <Typography type="note" variant="tertiary">
                  {elapsed(c.createdAt, now)}
                </Typography>
              </Row>
              <Markdown escapeHtml source={c.body} />
            </Stack>
          ))}
          <Stack gap="100">
            {reply ? (
              <InputFrame>
                <Container padding={THREAD_PADDING}>
                  <HighlightTextAreaField
                    frameless
                    hideLabel
                    data-testid={ReviewThreadTestId.ReplyInput}
                    highlights={[]}
                    label={t("reply")}
                    maxRows={5}
                    onChange={(e) =>
                      reply.onChange({ body: e.target.value, resolve: reply.resolve })
                    }
                    placeholder={t("reply")}
                    rows={1}
                    value={reply.body}
                  />
                </Container>
              </InputFrame>
            ) : null}
            <Row gap="150" justify="between">
              <ChatAboutButton about={threadChatAbout(thread, { pr: prRef, outcome })} />
              {reply ? (
                <Row gap="150">
                  <label>
                    <Row gap="100">
                      <Checkbox
                        checked={reply.resolve}
                        data-testid={ReviewThreadTestId.Resolve}
                        label={t("resolve")}
                        onChange={(next) => reply.onChange({ body: reply.body, resolve: next })}
                      />
                      <Typography aria-hidden="true" as="span" type="note">
                        {t("resolve")}
                      </Typography>
                    </Row>
                  </label>
                  {reply.onSend ? (
                    <Button
                      aria-label={t("send")}
                      data-testid={ReviewThreadTestId.Send}
                      disabled={(!reply.body.trim() && !reply.resolve) || reply.sending}
                      icon="arrow"
                      intent="primary"
                      loading={reply.sending}
                      onClick={reply.onSend}
                      size="sm"
                      title={t("send")}
                    />
                  ) : null}
                </Row>
              ) : null}
            </Row>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
