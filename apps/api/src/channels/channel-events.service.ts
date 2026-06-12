import { Injectable } from "@nestjs/common"
import { type Observable, Subject } from "rxjs"
import type { ChannelItem } from "@zibby/contracts"

/** A channel-item transition pushed onto the unified SSE channel (decision 15). */
export interface ChannelItemEvent {
  itemId: string
  state: ChannelItem["state"]
}

/**
 * The push source for channel-item changes. The watcher/triage flow call
 * {@link emit} whenever an item lands or transitions; the events controller merges
 * {@link stream} into `/api/events` as the `"channel-items"` scope, so the inbox
 * and approvals queue refresh live. A thin invalidation bus — the payload is just
 * `{ itemId, state }`; clients refetch the list off it.
 */
@Injectable()
export class ChannelEventsService {
  private readonly subject = new Subject<ChannelItemEvent>()

  emit(event: ChannelItemEvent): void {
    this.subject.next(event)
  }

  stream(): Observable<ChannelItemEvent> {
    return this.subject.asObservable()
  }
}
