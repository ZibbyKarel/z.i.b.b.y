"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Container,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useReplyInboxPrThreadMutation } from "../mutations";
import { useInboxPrThreadsQuery } from "../queries";
import { ReviewThread } from "./ReviewThread/ReviewThread";

export enum PrThreadsTestId {
  Root = "pr-threads-root",
  Summary = "pr-threads-summary",
  ShowResolved = "pr-threads-show-resolved",
  Error = "pr-threads-error",
  ReplyError = "pr-threads-reply-error",
}

export interface PrThreadsProps {
  projectId: string;
  number: number;
  /** Epoch ms used for the relative comment ages. */
  now: number;
}

interface Draft {
  body: string;
  resolve: boolean;
}

const EMPTY: Draft = { body: "", resolve: false };

/** Collapsible "Review threads" block of the PR detail: reply to / resolve open threads. */
export function PrThreads({ projectId, number, now }: PrThreadsProps) {
  const t = useTranslations("inboxPage.threads");
  const { data, isError } = useInboxPrThreadsQuery(projectId, number);
  const reply = useReplyInboxPrThreadMutation();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expanded, setExpanded] = useState<boolean | undefined>(undefined);
  const [showResolved, setShowResolved] = useState(false);

  if (isError)
    return (
      <Typography data-testid={PrThreadsTestId.Error} type="bodySm" variant="secondary">
        {t("error")}
      </Typography>
    );
  if (!data || data.length === 0) return null;

  const unresolved = data.filter((th) => !th.isResolved);
  const resolved = data.filter((th) => th.isResolved);
  const isOpen = expanded ?? unresolved.length > 0;

  return (
    <Container data-testid={PrThreadsTestId.Root} shrink={false}>
      <Accordion>
        <AccordionSummary expanded={isOpen} onToggle={() => setExpanded(!isOpen)}>
          <Typography data-testid={PrThreadsTestId.Summary} type="labelSm">
            {t("summary", { open: unresolved.length, resolved: resolved.length })}
          </Typography>
        </AccordionSummary>
        <AccordionDetails expanded={isOpen}>
          <Stack gap="150">
            {unresolved.map((th) => {
              const draft = drafts[th.id] ?? EMPTY;
              return (
                <Stack gap="50" key={th.id}>
                  <ReviewThread
                    now={now}
                    reply={{
                      ...draft,
                      sending: reply.isPending && reply.variables?.params.threadId === th.id,
                      onChange: (next) => setDrafts((d) => ({ ...d, [th.id]: next })),
                      onSend: () =>
                        reply.mutate(
                          {
                            params: { projectId, number, threadId: th.id },
                            body: {
                              ...(draft.body.trim() ? { body: draft.body } : {}),
                              ...(draft.resolve ? { resolve: true } : {}),
                            },
                          },
                          { onSuccess: () => setDrafts((d) => ({ ...d, [th.id]: EMPTY })) },
                        ),
                    }}
                    thread={th}
                  />
                  {reply.isError && reply.variables?.params.threadId === th.id && (
                    <Typography
                      data-testid={PrThreadsTestId.ReplyError}
                      type="bodySm"
                      variant="secondary"
                    >
                      {t("replyError")}
                    </Typography>
                  )}
                </Stack>
              );
            })}
            {resolved.length > 0 && !showResolved && (
              <Button
                data-testid={PrThreadsTestId.ShowResolved}
                intent="ghost"
                onClick={() => setShowResolved(true)}
                size="sm"
              >
                {t("showResolved")}
              </Button>
            )}
            {showResolved &&
              resolved.map((th) => <ReviewThread key={th.id} now={now} thread={th} />)}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Container>
  );
}
