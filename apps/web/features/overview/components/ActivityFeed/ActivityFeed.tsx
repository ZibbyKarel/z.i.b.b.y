import { Fragment } from "react"
import {
  Container,
  Divider,
  Icon,
  type IconName,
  type IconTone,
  Stack,
  Typography,
} from "@zibby/design-system"
import type { ActivityEntry, ActivityKind } from "@zibby/contracts"

/** The four glyph buckets a kind maps to (the legacy demo feed's vocabulary). */
type ActivityIcon = "run" | "wait" | "ok" | "edit"

const ICON_NAME: Record<ActivityIcon, IconName> = {
  run: "run",
  wait: "wait",
  ok: "ok",
  edit: "edit",
}

const ICON_TONE: Record<ActivityIcon, IconTone> = {
  run: "run",
  wait: "warn",
  ok: "ok",
  edit: "dim",
}

/**
 * Map an activity kind to a glyph bucket (decision 8): work starting → "run",
 * something waiting on the operator → "wait", a clean completion → "ok",
 * everything else (record-keeping) → "edit".
 */
export function activityIcon(kind: ActivityKind): ActivityIcon {
  if (kind === "run-started" || kind.startsWith("task-")) return "run"
  if (kind.endsWith("-parked") || kind === "approval-requested" || kind === "gate-decision") return "wait"
  if (kind.endsWith("-finished") || kind === "approval-approved" || kind === "channel-reply") return "ok"
  return "edit"
}

/** A compact, locale-agnostic relative time ("now", "5m", "3h", "2d"). */
export function relativeTime(at: string, now: number = Date.now()): string {
  const diffMs = now - new Date(at).getTime()
  if (Number.isNaN(diffMs)) return ""
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return "now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

/** The most specific ref an entry carries — the mono trace cue under the summary. */
function traceCue(entry: ActivityEntry): string {
  const { refs } = entry
  return refs.runRef ?? refs.taskId ?? refs.approvalId ?? refs.itemId ?? refs.noteId ?? entry.kind
}

export enum ActivityFeedTestId {
  Root = "activity-feed",
  Item = "activity-feed-item",
  Summary = "activity-feed-summary",
  Time = "activity-feed-time",
}

export interface ActivityFeedProps {
  items: ActivityEntry[]
  /** Max number of entries to show. */
  limit?: number
}

/** A compact, time-stamped feed of recorded activity (Phase 6.1). */
export function ActivityFeed({ items, limit = 5 }: ActivityFeedProps) {
  const shown = items.slice(0, limit)
  return (
    <Stack data-testid={ActivityFeedTestId.Root}>
      {shown.map((e, i) => {
        const icon = activityIcon(e.kind)
        return (
          <Fragment key={e.id}>
            <Container data-testid={ActivityFeedTestId.Item} padding={["100", "0"]}>
              <Stack direction="row" gap="150">
                <Icon name={ICON_NAME[icon]} size="sm" tone={ICON_TONE[icon]} />
                <Container grow minW0>
                  <Stack gap="25">
                    <Typography data-testid={ActivityFeedTestId.Summary} size="base" type="note">
                      {e.summary}
                    </Typography>
                    <Typography mono truncate size="sm" type="note" variant="tertiary">
                      {traceCue(e)}
                    </Typography>
                  </Stack>
                </Container>
                <Typography
                  mono
                  data-testid={ActivityFeedTestId.Time}
                  size="sm"
                  type="note"
                  variant="tertiary"
                >
                  {relativeTime(e.at)}
                </Typography>
              </Stack>
            </Container>
            {i < shown.length - 1 && <Divider />}
          </Fragment>
        )
      })}
    </Stack>
  )
}
