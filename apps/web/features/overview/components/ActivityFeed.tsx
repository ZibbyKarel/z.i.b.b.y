import { Fragment } from "react"
import {
  Container,
  Divider,
  Icon,
  Stack,
  StatusDot,
  Typography,
  type IconTone,
} from "@zibby/design-system"
import type { ActivityEvent, ActivityIcon } from "../../../domain"

const iconTone: Record<ActivityIcon, IconTone> = {
  run: "work",
  wait: "warn",
  ok: "ok",
  edit: "dim",
}

export interface ActivityFeedProps {
  items: ActivityEvent[]
  /** Max number of events to show. */
  limit?: number
}

/** A compact, time-stamped activity feed of recent agent events. */
export function ActivityFeed({ items, limit = 5 }: ActivityFeedProps) {
  const shown = items.slice(0, limit)
  return (
    <Stack>
      {shown.map((e, i) => (
        <Fragment key={e.id}>
          <Container padding={["100", "0"]}>
            <Stack direction="row" gap="150">
              <Icon name={e.icon} size="sm" tone={iconTone[e.icon]} />
              <Container grow minW0>
                <Stack gap="25">
                  <Typography type="note" size="base">
                    {e.text}
                  </Typography>
                  <Typography type="note" mono size="sm" variant="tertiary" truncate>
                    {e.sub}
                  </Typography>
                </Stack>
              </Container>
              <Stack direction="row" align="center" gap="75">
                <StatusDot tone={e.ctx === "work" ? "work" : "home"} size="75" />
                <Typography type="note" mono size="sm" variant="tertiary">
                  {e.t}
                </Typography>
              </Stack>
            </Stack>
          </Container>
          {i < shown.length - 1 && <Divider />}
        </Fragment>
      ))}
    </Stack>
  )
}
