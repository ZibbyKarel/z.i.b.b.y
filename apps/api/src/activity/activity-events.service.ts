import { Injectable } from "@nestjs/common"
import type { ActivityKind } from "@zibby/contracts"
import { type Observable, Subject } from "rxjs"

/** An activity entry recorded onto the unified SSE channel (decision 7). */
export interface ActivityEvent {
  kind: ActivityKind
  at: string
}

/**
 * The push source for activity entries — the {@link ChannelEventsService} twin. The
 * activity log calls {@link emit} after every appended entry; the events controller
 * merges {@link stream} into `/api/events` as the `"activity"` scope, so the
 * overview feed and the briefing card refresh live. A thin invalidation bus: the
 * payload is just `{ kind, at }`; the client refetches the activity/briefing query
 * off it.
 */
@Injectable()
export class ActivityEventsService {
  private readonly subject = new Subject<ActivityEvent>()

  emit(event: ActivityEvent): void {
    this.subject.next(event)
  }

  stream(): Observable<ActivityEvent> {
    return this.subject.asObservable()
  }
}
