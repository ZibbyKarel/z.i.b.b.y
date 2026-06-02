import { Fragment } from "react"
import {
  Container,
  Divider,
  Icon,
  type IconTone,
  Stack,
  Typography,
} from "@zibby/design-system"
import type { ActivityEvent, ActivityIcon } from "../../../../domain"

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
                  <Typography size="base" type="note">
                    {e.text}
                  </Typography>
                  <Typography mono truncate size="sm" type="note" variant="tertiary">
                    {e.sub}
                  </Typography>
                </Stack>
              </Container>
              <Typography mono size="sm" type="note" variant="tertiary">
                {e.t}
              </Typography>
            </Stack>
          </Container>
          {i < shown.length - 1 && <Divider />}
        </Fragment>
      ))}
    </Stack>
  )
}
