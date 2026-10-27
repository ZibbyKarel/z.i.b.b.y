"use client";

import {
  Accordion,
  AccordionItem,
  ChatBubble,
  Container,
  LogStream,
  Markdown,
  Panel,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { LogStreamLine } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import type { DashboardApproval } from "../../approvals/approval";
import type { RunView } from "../run";
import { agentBody } from "../runDetailModel";
import type { FeedItem, RunMode, StageRailRow } from "../runDetailModel";
import { useStageRunLogQuery } from "../queries/useStageRunLogQuery";
import { GoalDetailPanel } from "./GoalDetailPanel";
import {
  LimitPausedPanel,
  RunErrorBanner,
  RunParkedBanner,
  RunQuestionBanner,
} from "./RunFeedBanners";

export enum RunLiveFeedTestId {
  Root = "run-live-feed",
  Agent = "run-feed-agent",
  You = "run-feed-you",
  Delivery = "run-feed-delivery",
  Round = "run-feed-round",
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

function AgentBody({
  markdown,
  tools,
  live,
}: {
  markdown: string;
  tools: LogStreamLine[];
  live: boolean;
}) {
  return (
    <Stack gap="75">
      {markdown && <Markdown escapeHtml source={markdown} />}
      {tools.length > 0 && (
        <Panel padding={["100", "150"]}>
          <LogStream lines={tools} paused={!live} />
        </Panel>
      )}
    </Stack>
  );
}

/** An earlier round: its finished log is fetched only once the section is opened (details mount lazily). */
function PriorRoundLog({
  runId,
  phaseId,
  stageRunId,
  raw,
}: {
  runId: string;
  phaseId: string;
  stageRunId: string;
  raw: boolean;
}) {
  const { data } = useStageRunLogQuery(runId, phaseId, stageRunId);
  const body = agentBody(phaseId, data?.content ?? "", raw);
  return (
    <Container data-testid={RunLiveFeedTestId.Round}>
      <AgentBody {...body} live={false} />
    </Container>
  );
}

function FeedAgent({ item, runId }: { item: Item<"agent">; runId: string }) {
  const t = useTranslations("runs.detail.feed");
  const { rounds } = item;
  const body = <AgentBody live={item.live} markdown={item.markdown} tools={item.tools} />;
  return (
    <Container data-testid={RunLiveFeedTestId.Agent} maxWidth="760px">
      <Stack gap="75">
        <Typography as="span" type="labelSm">
          {item.who}
        </Typography>
        {rounds.length < 2 ? (
          body
        ) : (
          // key: a new round remounts the accordion so the newest one opens
          <Accordion single key={rounds.length}>
            {rounds.map((r, i) => (
              <AccordionItem
                defaultExpanded={i === rounds.length - 1}
                key={r.n}
                summary={t("round", { n: r.n })}
              >
                {i === rounds.length - 1 ? (
                  <Container data-testid={RunLiveFeedTestId.Round}>{body}</Container>
                ) : (
                  <PriorRoundLog
                    phaseId={item.phaseId}
                    raw={!!item.raw}
                    runId={runId}
                    stageRunId={r.stageRunId}
                  />
                )}
              </AccordionItem>
            ))}
          </Accordion>
        )}
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
      {mode === "error" && run.taskOutcomeSummary && (
        <RunErrorBanner reason={run.taskOutcomeSummary} />
      )}
      {mode === "parked" && <RunParkedBanner run={run} stage={parkedStage} />}
      {mode === "limit" && <LimitPausedPanel run={run} />}
      {items.map((item) => {
        switch (item.kind) {
          case "divider":
            return null; // the stage rail already names each phase with its state and time
          case "agent":
            return <FeedAgent item={item} key={`a-${item.phaseId}`} runId={run.runId} />;
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
