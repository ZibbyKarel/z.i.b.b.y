import { Injectable } from "@nestjs/common";
import type { ActivityEntry, ActivityKind } from "@zibby/contracts";
import { type Observable, Subject } from "rxjs";

/**
 * An activity entry recorded onto the unified SSE channel (decision 7). Carries the
 * full {@link ActivityEntry} so the RightRail live log can **prepend** it without a
 * refetch round-trip; `kind`/`at` stay flat for the cheap invalidation consumers
 * (the small overview feed + the briefing card).
 */
export interface ActivityEvent {
  kind: ActivityKind;
  at: string;
  entry: ActivityEntry;
}

/**
 * The push source for activity entries — the {@link ChannelEventsService} twin. The
 * activity log calls {@link emit} after every appended entry; the events controller
 * merges {@link stream} into `/api/events` as the `"activity"` scope, so the
 * RightRail live log prepends the entry and the overview feed / briefing card
 * refresh live.
 */
@Injectable()
export class ActivityEventsService {
  private readonly subject = new Subject<ActivityEvent>();

  emit(event: ActivityEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<ActivityEvent> {
    return this.subject.asObservable();
  }
}
