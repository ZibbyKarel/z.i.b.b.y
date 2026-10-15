import { type DotTone, Row, StatusDot, Typography } from "@zibby/design-system";
import type { InboxPrBlocker } from "@zibby/contracts";
import { useTranslations } from "next-intl";
import type { ZibbyStatus } from "../inbox";

/** Status → dot tone, the design's `idle / blocked / working / done`. */
export const ZIBBY_STATUS_TONE: Record<ZibbyStatus, DotTone> = {
  new: "idle",
  waiting: "blocked",
  running: "working",
  done: "done",
};

/** PR blocker → tone, the design's `BL` table. */
export const PR_BLOCKER_TONE: Record<InboxPrBlocker, "idle" | "blocked" | "working" | "error"> = {
  "ci-failing": "error",
  "changes-requested": "blocked",
  "merge-conflict": "error",
  "awaiting-review": "idle",
  "ready-to-merge": "working",
};

export enum ZibbyStatusLabelTestId {
  Root = "inbox-zibby-status",
}

/** ZIBBY execution status: a tone dot + its label ("Waiting for you"). */
export function ZibbyStatusLabel({ status }: { status: ZibbyStatus }) {
  const t = useTranslations("inboxPage.status");
  return (
    <Row inline as="span" data-testid={`${ZibbyStatusLabelTestId.Root}-${status}`} gap="75">
      <StatusDot pulse={status === "running"} tone={ZIBBY_STATUS_TONE[status]} />
      <Typography as="span" type="label" variant="primary">
        {t(status)}
      </Typography>
    </Row>
  );
}
