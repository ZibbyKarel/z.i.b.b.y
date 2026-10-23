"use client";

import {
  AgentBadge,
  ChatBubble,
  Container,
  Divider,
  LogStream,
  Markdown,
  Panel,
  Stack,
  StatusDot,
  Typography,
} from "@zibby/design-system";
import { useAgentSymbol } from "../../agents";
import { useLocale, useTranslations } from "next-intl";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../run";
import type { FeedItem, RunMode, StageRailRow } from "../runDetailModel";
import { GoalDetailPanel } from "./GoalDetailPanel";
import { LimitPausedPanel, RunParkedBanner, RunQuestionBanner } from "./RunFeedBanners";

export enum RunLiveFeedTestId {
  Root = "run-live-feed",
  Divider = "run-feed-divider",
  Agent = "run-feed-agent",
  You = "run-feed-you",
  Delivery = "run-feed-delivery",
}

export interface RunLiveFeedProps {
  run: RunView;
  mode: RunMode;
  approval?: DashboardApproval;
  items: FeedItem[];
  /** The stage rail rows — the parked banner names its stage from them. */
  rail?: StageRailRow[];
}

type Item<K extends FeedItem["kind"]> = Extract<FeedItem, { kind: K }>;

function FeedDivider({ item }: { item: Item<"divider"> }) {
  const t = useTranslations("runs.detail.stage");
  const text = [item.label, t(item.stateKey), item.meta !== "—" ? item.meta : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Stack align="center" data-testid={RunLiveFeedTestId.Divider} direction="row" gap="150">
      <Container grow>
        <Divider />
      </Container>
      <Stack inline align="center" direction="row" gap="75">
        <StatusDot size="75" tone={item.state} />
        <Typography as="span" type="labelSm">
          {text}
        </Typography>
      </Stack>
      <Container grow>
        <Divider />
      </Container>
    </Stack>
  );
}

function FeedAgent({ item }: { item: Item<"agent"> }) {
  const symbolOf = useAgentSymbol();
  return (
    <Container data-testid={RunLiveFeedTestId.Agent} maxWidth="760px">
      <Stack align="start" direction="row" gap="150">
        <AgentBadge
          {...symbolOf(item.who)}
          pulse={item.live}
          size="md"
          state={item.live ? "working" : "idle"}
        />
        <Stack grow gap="75">
          <Typography as="span" type="labelSm">
            {item.who}
          </Typography>
          {item.markdown && <Markdown escapeHtml source={item.markdown} />}
          {item.tools.length > 0 && (
            <Panel padding={["100", "150"]}>
              <LogStream lines={item.tools} paused={!item.live} />
            </Panel>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}

function FeedYou({ item, stageLabel }: { item: Item<"you">; stageLabel?: string }) {
  const t = useTranslations("runs.detail.feed");
  const locale = useLocale();
  const at = new Date(item.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const delivery =
    item.delivery === "delivered"
      ? t("delivered", { stage: stageLabel ?? item.deliveredPhaseId ?? "—" })
      : item.delivery === "queued"
        ? t("queued")
        : t("notDelivered");
  return (
    <Stack align="end" data-testid={RunLiveFeedTestId.You} gap="50">
      <Typography as="span" type="labelSm">
        {t("youTo", { to: item.to, t: at })}
      </Typography>
      <Container maxWidth="520px">
        <ChatBubble author="you">{item.text}</ChatBubble>
      </Container>
      <Typography as="span" data-testid={RunLiveFeedTestId.Delivery} type="labelSm">
        {delivery}
      </Typography>
    </Stack>
  );
}

/** The LIVE view: the mode's banner (question / parked / limit), then the stage feed in order. The approval banner sits above the whole detail. */
export function RunLiveFeed({ run, mode, approval, items, rail = [] }: RunLiveFeedProps) {
  if (run.kind === "goal") return <GoalDetailPanel run={run} />;

  const dividerLabel = new Map(
    items.flatMap((i) => (i.kind === "divider" ? [[i.phaseId, i.label] as const] : [])),
  );
  const parkedStage =
    rail.find((r) => r.phaseId === run.parked?.phaseId) ?? rail.find((r) => r.current);

  return (
    <Stack data-testid={RunLiveFeedTestId.Root} gap="150">
      {mode === "question" && approval && (
        <RunQuestionBanner
          agentName={approval.skill}
          question={approval.summary ?? approval.text ?? approval.detail}
        />
      )}
      {mode === "parked" && <RunParkedBanner run={run} stage={parkedStage} />}
      {mode === "limit" && <LimitPausedPanel run={run} />}
      {items.map((item) => {
        switch (item.kind) {
          case "divider":
            return <FeedDivider item={item} key={`d-${item.phaseId}`} />;
          case "agent":
            return <FeedAgent item={item} key={`a-${item.phaseId}`} />;
          case "you":
            return (
              <FeedYou
                item={item}
                key={`y-${item.id}`}
                stageLabel={item.deliveredPhaseId && dividerLabel.get(item.deliveredPhaseId)}
              />
            );
        }
      })}
    </Stack>
  );
}
