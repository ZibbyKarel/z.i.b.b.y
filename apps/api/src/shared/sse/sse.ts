import type { MessageEvent } from "@nestjs/common"
import type { RunLogChunk } from "@zibby/contracts"
import { Observable } from "rxjs"

/**
 * SSE plumbing shared by the streaming endpoints. The frontend used to poll runs
 * (every 2s), the pipeline aggregate (1s) and each open log (1s); with several
 * parallel runs that multiplied into a steady stream of mostly-empty requests.
 * These helpers turn the runner's push events into long-lived `Observable`s the
 * `@Sse()` handlers return — the server now speaks only when something actually
 * changed, and the per-client interval timers are gone.
 */

/** How often an otherwise-idle stream emits a keep-alive so proxies don't drop it. */
const HEARTBEAT_MS = 25_000

/**
 * Stream one run's log as offset-keyed deltas. `read(offset)` returns the bytes
 * after `offset` (the very call the poll endpoint makes, so the streamed text is
 * byte-identical); `subscribe` registers a listener fired whenever new bytes are
 * appended and returns an unsubscribe.
 *
 * The stream starts at `startOffset` — seeded from the client's `Last-Event-ID`
 * so a dropped connection resumes exactly where it left off instead of re-sending
 * the whole backlog — tags every event with its `nextOffset` as the SSE `id`, and
 * `complete()`s once the run reports `done`. A drained read with no new bytes
 * parks until the next append signal; a `dirty` flag set during an in-flight read
 * guarantees a signal that arrives mid-read is never missed.
 */
export function streamRunLog(
  startOffset: number,
  read: (offset: number) => Promise<RunLogChunk>,
  subscribe: (listener: () => void) => () => void,
): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    let offset = startOffset
    let dirty = true
    let pumping = false
    let closed = false

    const pump = async (): Promise<void> => {
      if (pumping || closed) return
      pumping = true
      try {
        while (dirty && !closed) {
          dirty = false
          const chunk = await read(offset)
          if (closed) return
          if (chunk.content) {
            offset = chunk.nextOffset
            subscriber.next({
              id: String(offset),
              data: JSON.stringify({ content: chunk.content, nextOffset: offset, done: chunk.done }),
            })
            // More may have landed while we awaited the read above.
            dirty = true
          }
          if (chunk.done) {
            // A run already finished (or finishing with no tail) still needs a final
            // marker so the client flips to "done" and closes its EventSource.
            if (!chunk.content) {
              subscriber.next({
                id: String(chunk.nextOffset),
                data: JSON.stringify({ content: "", nextOffset: chunk.nextOffset, done: true }),
              })
            }
            closed = true
            subscriber.complete()
            return
          }
        }
      } catch (error) {
        if (!closed) {
          closed = true
          subscriber.error(error)
        }
      } finally {
        pumping = false
      }
    }

    const unsubscribe = subscribe(() => {
      dirty = true
      void pump()
    })
    const heartbeat = setInterval(() => {
      if (!closed) subscriber.next({ type: "ping", data: "" })
    }, HEARTBEAT_MS)
    heartbeat.unref?.()
    void pump()

    return () => {
      closed = true
      clearInterval(heartbeat)
      unsubscribe()
    }
  })
}

/** The shape every run-status event carries on the unified `/api/events` channel. */
export interface RunStatusEvent {
  /** Which client query family to refetch. */
  scope: "agent-runs" | "pipeline-runs" | "goal-runs"
  runId: string
  status: string
}

/**
 * Turn a runner's status subscription into an `Observable` of SSE messages. The
 * payload is deliberately minimal — `{ scope, runId, status }` — because the
 * channel is an invalidation bus: the client refetches the matching query off it
 * rather than reconciling a pushed record, keeping the list endpoints the single
 * source of truth (the same pattern the runs feed already used for approvals).
 */
export function fromRunStatus<T>(
  scope: RunStatusEvent["scope"],
  subscribe: (listener: (run: T) => void) => () => void,
  project: (run: T) => { runId: string; status: string },
): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    const unsubscribe = subscribe((run) => {
      const { runId, status } = project(run)
      const event: RunStatusEvent = { scope, runId, status }
      subscriber.next({ data: JSON.stringify(event) })
    })
    return () => unsubscribe()
  })
}

/** A bare keep-alive stream, merged into the status channel so it never idles out. */
export function heartbeats(): Observable<MessageEvent> {
  return new Observable<MessageEvent>((subscriber) => {
    const timer = setInterval(() => subscriber.next({ type: "ping", data: "" }), HEARTBEAT_MS)
    timer.unref?.()
    return () => clearInterval(timer)
  })
}
