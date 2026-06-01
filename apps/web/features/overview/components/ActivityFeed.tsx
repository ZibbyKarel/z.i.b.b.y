import { cn, Icon, StatusDot, type ActivityEvent, type ActivityIcon } from "@zibby/design-system"

const iconTone: Record<ActivityIcon, string> = {
  run: "text-run",
  wait: "text-warn",
  ok: "text-ok",
  edit: "text-foreground-dim",
}

export interface ActivityFeedProps {
  items: ActivityEvent[]
  /** Max number of events to show. */
  limit?: number
  className?: string
}

/** A compact, time-stamped activity feed of recent agent events. */
export function ActivityFeed({ items, limit = 5, className }: ActivityFeedProps) {
  return (
    <div className={className}>
      {items.slice(0, limit).map((e) => (
        <div
          key={e.id}
          className="flex gap-3 border-b border-border py-2.5 last:border-b-0"
        >
          <span className={cn("mt-px flex", iconTone[e.icon])}>
            <Icon name={e.icon} size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base text-foreground">{e.text}</div>
            <span className="mt-0.5 block truncate font-mono text-sm text-foreground-faint">
              {e.sub}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusDot tone={e.ctx === "work" ? "work" : "home"} size={5} />
            <span className="font-mono text-sm text-foreground-faint">{e.t}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
