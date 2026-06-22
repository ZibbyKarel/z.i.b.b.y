import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button, Card, Container, Stack, Tag, Typography } from "@zibby/design-system";
import type { ChannelItem, TriageVerdict } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { compactAgo } from "../../../utils/time";
import { useChannelItemsQuery } from "../queries";
import { useDismissChannelItemMutation } from "../mutations";

export enum NeedsAttentionTestId {
  Root = "needs-attention",
  Card = "needs-attention-card",
  Dismiss = "needs-attention-dismiss",
  OpenEmail = "needs-attention-open",
}

/** Category → chip tone (a bug reads louder than a routine question). */
const CATEGORY_TONE: Record<TriageVerdict["category"], "bad" | "accent" | "warn" | "neutral"> = {
  bug: "bad",
  question: "accent",
  request: "warn",
  other: "neutral",
};

/**
 * Gmail deep link to the original message by its RFC-822 Message-ID — the stable,
 * provider-native handle (no UID/thread guessing). Returns null when the item carries
 * no Message-ID, so the card simply omits the link.
 */
function gmailLink(messageId: string | undefined): string | null {
  if (!messageId) return null;
  const id = messageId.replace(/^<|>$/g, "");
  return `https://mail.google.com/mail/u/0/#search/rfc822msgid:${encodeURIComponent(id)}`;
}

/** One "needs you" card: what it is (summary), where it came from, and two actions. */
function NeedsAttentionCard({ item, now }: { item: ChannelItem; now: number }) {
  const t = useTranslations();
  const dismiss = useDismissChannelItemMutation();
  const link = item.kind === "email" ? gmailLink(item.externalRef.messageId) : null;
  // Prefer the triager's one-line summary; fall back to the sender + raw preview so a
  // degraded (router-down) item is still legible.
  const summary = item.triage?.summary?.trim() || `${item.from ? `${item.from}: ` : ""}${item.text}`;
  return (
    <Card corners data-testid={NeedsAttentionTestId.Card} tone="warn">
      <Container padding="200">
        <Stack gap="100">
          <Stack align="center" direction="row" gap="75" justify="between">
            <Stack align="center" direction="row" gap="75">
              {item.triage && (
                <Tag tone={CATEGORY_TONE[item.triage.category]}>
                  {t(`inbox.category.${item.triage.category}`)}
                </Tag>
              )}
              {item.projectId && <Tag tone="accent">{item.projectId}</Tag>}
              <Typography mono size="xs" type="note" variant="tertiary">
                {compactAgo(item.receivedAt, now)}
              </Typography>
            </Stack>
            <Typography mono truncate size="xs" type="note" variant="tertiary">
              {item.from ?? item.integrationId}
            </Typography>
          </Stack>

          <Container minW0>
            <Typography truncate size="base" type="note" variant="secondary">
              {summary}
            </Typography>
          </Container>

          <Stack align="center" direction="row" gap="150">
            {link && (
              <a data-testid={NeedsAttentionTestId.OpenEmail} href={link} rel="noreferrer" target="_blank">
                <Typography size="sm" tone="accent" type="note" weight="semibold">
                  {t("inbox.attention.openEmail")}
                </Typography>
              </a>
            )}
            <Button
              data-testid={NeedsAttentionTestId.Dismiss}
              disabled={dismiss.isPending}
              icon="check"
              intent="ghost"
              onClick={() => dismiss.mutate({ params: { id: item.id }, body: {} })}
              size="sm"
            >
              {t("inbox.attention.dismiss")}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

export interface NeedsAttentionPanelProps {
  /** Scope to one project's items; omit for the global (all-projects) list. */
  projectId?: string;
}

/**
 * The overview "needs your attention" surface: the notify-only items ZIBBY decided the
 * operator should see — inbound mail that wants a reply or a decision — as one-line
 * summary cards linking to the original message. ZIBBY never acted on these (no run, no
 * reply); it only flagged them. Parked approvals (with an `approvalId`) are excluded —
 * those live in the approvals queue. Hidden entirely when nothing needs the operator.
 */
export function NeedsAttentionPanel({ projectId }: NeedsAttentionPanelProps) {
  const t = useTranslations();
  // Render-stable "now" for relative times (Date.now() in render is impure — lint trap).
  const [now] = useState(() => Date.now());
  const { data: items = [] } = useChannelItemsQuery();
  const surfaced = items
    .filter((i) => i.state === "triaged" && !i.approvalId)
    .filter((i) => (projectId ? i.projectId === projectId : true));
  if (surfaced.length === 0) return null;

  const recent = [...surfaced].reverse().slice(0, 12);
  return (
    <Container data-testid={NeedsAttentionTestId.Root}>
      <HudPanel title={t("inbox.attention.title")}>
        <Stack direction="col" gap="100">
          {recent.map((item) => (
            <NeedsAttentionCard item={item} key={item.id} now={now} />
          ))}
        </Stack>
      </HudPanel>
    </Container>
  );
}
