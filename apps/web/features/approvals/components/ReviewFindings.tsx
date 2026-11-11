"use client";

import {
  Button,
  Card,
  CardContent,
  Container,
  FileDiffView,
  HighlightTextAreaField,
  InputFrame,
  Markdown,
  Row,
  Stack,
  Tag,
  TextLink,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { findingChatAbout } from "../../chat/chatAbout";
import { ChatAboutButton } from "../../chat/components/ChatAboutButton";
import { THREAD_PADDING, snippetDiff } from "../../inbox/components/ReviewThread/ReviewThread";
import { type ReviewFinding, findingHunk, prFileLineUrl } from "../prReviewDoc";

export enum ReviewFindingsTestId {
  Root = "review-findings-root",
  Summary = "review-findings-summary",
  Finding = "review-findings-finding",
  File = "review-findings-file",
  Severity = "review-findings-severity",
  FileLink = "review-findings-file-link",
  Snippet = "review-findings-snippet",
  Comment = "review-findings-comment",
  Remove = "review-findings-remove",
}

const severityTone = { Critical: "error", Important: "blocked", Minor: "neutral" } as const;

export interface ReviewFindingsProps {
  approvalId: string;
  summary: string;
  findings: ReviewFinding[];
  /** The PR's unified diff — gives each finding its code context; absent while loading. */
  diff?: string;
  /** The PR's URL — turns each file into a link to that line in the PR's "Files changed". */
  prUrl?: string;
  /** Edited comment text by finding index; an absent entry keeps the agent's text. */
  edits?: Record<number, string>;
  onEdit?(index: number, body: string): void;
  /** Indices of the findings the operator dropped — not rendered, not posted. */
  removed?: number[];
  onRemove?(index: number): void;
}

/** `path:line`, linked to that line of the file in the PR once GitHub's diff anchor is computed. */
function FindingFile({
  label,
  prUrl,
  path,
  line,
}: {
  label: string;
  prUrl?: string;
  path: string;
  line: number;
}) {
  const t = useTranslations("approvals");
  const key = `${prUrl}|${path}|${line}`;
  const [resolved, setResolved] = useState<{ key: string; href: string } | null>(null);
  useEffect(() => {
    let live = true;
    if (prUrl)
      void prFileLineUrl(prUrl, path, line).then((href) => live && setResolved({ key, href }));
    return () => {
      live = false;
    };
  }, [key, prUrl, path, line]);
  const href = resolved?.key === key ? resolved.href : null;
  const text = (
    <Typography mono data-testid={ReviewFindingsTestId.File} type="data">
      {label}
    </Typography>
  );
  if (!href) return text;
  return (
    <TextLink
      aria-label={t("findingFileLink", { where: label })}
      data-testid={ReviewFindingsTestId.FileLink}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {text}
    </TextLink>
  );
}

/** A PR review document before posting: the summary, then one read-only card per finding. */
export function ReviewFindings({
  approvalId,
  summary,
  findings,
  diff,
  prUrl,
  edits = {},
  onEdit,
  removed = [],
  onRemove,
}: ReviewFindingsProps) {
  const t = useTranslations("approvals");
  return (
    <Stack data-testid={ReviewFindingsTestId.Root} gap="150">
      {summary && (
        <div data-testid={ReviewFindingsTestId.Summary}>
          <Markdown escapeHtml source={summary} />
        </div>
      )}
      {findings.map((original, i) => {
        if (removed.includes(i)) return null;
        const f = { ...original, body: edits[i] ?? original.body };
        const hunk = diff ? findingHunk(diff, f.path, f.line) : null;
        const where = `${f.path}:${f.startLine ? `${f.startLine}-` : ""}${f.line}`;
        return (
          <Card data-testid={ReviewFindingsTestId.Finding} key={`${f.path}:${where}`}>
            <CardContent padding={THREAD_PADDING}>
              <Stack gap="200">
                <Row wrap gap="150" justify="between">
                  <FindingFile label={where} line={f.line} path={f.path} prUrl={prUrl} />
                  {f.severity && (
                    <Tag
                      data-testid={ReviewFindingsTestId.Severity}
                      tone={severityTone[f.severity]}
                    >
                      {f.severity}
                    </Tag>
                  )}
                </Row>
                {hunk ? (
                  <div data-testid={ReviewFindingsTestId.Snippet}>
                    <FileDiffView diff={snippetDiff(f.path, hunk)} showFileName={false} />
                  </div>
                ) : null}
                <InputFrame>
                  <Container padding={THREAD_PADDING}>
                    <HighlightTextAreaField
                      frameless
                      hideLabel
                      data-testid={ReviewFindingsTestId.Comment}
                      highlights={[]}
                      label={t("findingComment")}
                      maxRows={10}
                      onChange={(e) => onEdit?.(i, e.target.value)}
                      rows={2}
                      value={f.body}
                    />
                  </Container>
                </InputFrame>
                <Row gap="150" justify="between">
                  <ChatAboutButton about={findingChatAbout(f, approvalId, summary)} />
                  {onRemove && (
                    <Button
                      data-testid={ReviewFindingsTestId.Remove}
                      icon="trash"
                      intent="ghost"
                      onClick={() => onRemove(i)}
                      size="sm"
                    >
                      {t("findingRemove")}
                    </Button>
                  )}
                </Row>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}
