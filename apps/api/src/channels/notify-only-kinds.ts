import type { ChannelItem } from "@zibby/contracts";

/**
 * Channel kinds handled notify-only: ZIBBY never dispatches a run or auto-replies for
 * them, it only surfaces a summary for the operator. Email is the first (decision: a
 * mailbox is a firehose — autonomous action on inbound mail burns budget and the gate
 * belongs to the human). Slack/Jira/GitHub keep their act-by-tier behaviour.
 *
 * Lives in its own module (NS2 F6a) so BOTH the triage flow and Herald's graduation
 * defense-in-depth can import it without a `channels ⇄ herald` import cycle (the flow
 * imports `HeraldService`; Herald must never import the flow back).
 */
export const NOTIFY_ONLY_KINDS: ReadonlySet<ChannelItem["kind"]> = new Set(["email"]);
