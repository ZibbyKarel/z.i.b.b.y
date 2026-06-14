import { useTranslations } from "next-intl";
import { Container, Stack, Tag, Typography } from "@zibby/design-system";
import type { ChannelItem, ChannelItemState } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useChannelItemsQuery } from "../queries";

/** Display tone for each item state — the single source for the inbox chip. */
const STATE_TONE: Record<ChannelItemState, "neutral" | "ok" | "warn" | "bad"> = {
  new: "neutral",
  triaged: "warn",
  handled: "ok",
  ignored: "bad",
};

/** Autonomy-contract tier → chip tone, escalating: 1 act-silently, 2 act-then-report,
 *  3 surface-and-wait. The tier — not the channel — decides how ZIBBY acted. */
const TIER_TONE: Record<1 | 2 | 3, "ok" | "accent" | "warn"> = {
  1: "ok",
  2: "accent",
  3: "warn",
};

export enum InboxPanelTestId {
  Root = "inbox-panel",
  Item = "inbox-item",
}

/** One inbox row: state chip, category, a text preview, and an approval marker. */
function InboxRow({ item }: { item: ChannelItem }) {
  const t = useTranslations();
  return (
    <Stack
      align="center"
      data-testid={InboxPanelTestId.Item}
      direction="row"
      gap="100"
      justify="between"
    >
      <Stack align="center" direction="row" gap="100">
        <Tag tone={STATE_TONE[item.state]}>{t(`inbox.state.${item.state}`)}</Tag>
        {item.triage && (
          <Tag tone={TIER_TONE[item.triage.tier]}>
            {t("inbox.tier", { n: item.triage.tier })}
          </Tag>
        )}
        {item.triage && <Tag tone="neutral">{t(`inbox.category.${item.triage.category}`)}</Tag>}
        {item.projectId && <Tag tone="accent">{item.projectId}</Tag>}
        <Container minW0 maxWidth="320px">
          <Typography truncate size="sm" type="note" variant="secondary">
            {item.text}
          </Typography>
        </Container>
      </Stack>
      <Stack align="center" direction="row" gap="75">
        {/* What ZIBBY did with it — the tiered autonomy action, so the inbox is
            accountable, not just a feed. */}
        {item.taskId && <Tag tone="accent">{t("inbox.dispatched")}</Tag>}
        {item.reply && <Tag tone="ok">{t("inbox.replied")}</Tag>}
        {item.approvalId && item.state === "triaged" && (
          <Tag tone="warn">{t("inbox.needsApproval")}</Tag>
        )}
        <Typography mono size="xs" type="note" variant="tertiary">
          {item.integrationId}
        </Typography>
      </Stack>
    </Stack>
  );
}

/**
 * The inbox feed on /integrations (decision 17): a minimal, read-only list of
 * recent ingested channel items — state, category, a preview and a link cue when a
 * Tier-3 reply is waiting in the approvals queue. The richer briefing view is
 * Phase 6's job. Hidden entirely when nothing has been ingested.
 */
export function InboxPanel() {
  const t = useTranslations();
  const { data: items = [] } = useChannelItemsQuery();
  if (items.length === 0) return null;

  const recent = [...items].reverse().slice(0, 12);
  return (
    <Container data-testid={InboxPanelTestId.Root}>
      <HudPanel title={t("inbox.title")}>
        <Stack direction="col" gap="100">
          {recent.map((item) => (
            <InboxRow item={item} key={item.id} />
          ))}
        </Stack>
      </HudPanel>
    </Container>
  );
}
