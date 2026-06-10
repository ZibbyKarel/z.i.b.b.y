import type { MessageEvent } from "@nestjs/common"
import type { RunLogChunk } from "@zibby/contracts"
import { describe, expect, it } from "vitest"
import { fromRunStatus, streamRunLog } from "./sse"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Parse the JSON payload a log-stream event carries (skipping `ping` keep-alives). */
function logChunks(events: MessageEvent[]): RunLogChunk[] {
  return events
    .filter((e) => e.type !== "ping")
    .map((e) => JSON.parse(String(e.data)) as RunLogChunk)
}

describe("streamRunLog", () => {
  it("replays a finished log from the start offset and completes", async () => {
    const full = "line-1\nline-2\n"
    const read = async (offset: number): Promise<RunLogChunk> => ({
      content: full.slice(offset),
      nextOffset: full.length,
      done: true,
    })

    const events: MessageEvent[] = []
    let completed = false
    streamRunLog(0, read, () => () => {}).subscribe({
      next: (e) => events.push(e),
      complete: () => {
        completed = true
      },
    })
    await sleep(10)

    const chunks = logChunks(events)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.content).toBe(full)
    expect(chunks[0]?.done).toBe(true)
    // The event id is the next offset, so a reconnect can resume past it.
    expect(events.find((e) => e.type !== "ping")?.id).toBe(String(full.length))
    expect(completed).toBe(true)
  })

  it("resumes from a non-zero start offset (Last-Event-ID), skipping the backlog", async () => {
    const full = "AAABBB"
    const read = async (offset: number): Promise<RunLogChunk> => ({
      content: full.slice(offset),
      nextOffset: full.length,
      done: true,
    })

    const events: MessageEvent[] = []
    streamRunLog(3, read, () => () => {}).subscribe({ next: (e) => events.push(e) })
    await sleep(10)

    expect(logChunks(events)[0]?.content).toBe("BBB")
  })

  it("pushes appended bytes on each signal, then completes when done", async () => {
    let buffer = "aaa"
    let done = false
    const read = async (offset: number): Promise<RunLogChunk> => ({
      content: buffer.slice(offset),
      nextOffset: buffer.length,
      done,
    })
    let fire: (() => void) | undefined
    const subscribe = (listener: () => void) => {
      fire = listener
      return () => {
        fire = undefined
      }
    }

    const events: MessageEvent[] = []
    let completed = false
    streamRunLog(0, read, subscribe).subscribe({
      next: (e) => events.push(e),
      complete: () => {
        completed = true
      },
    })
    await sleep(10)
    // Initial backlog delivered; stream parked (not done yet).
    expect(logChunks(events).map((c) => c.content)).toEqual(["aaa"])
    expect(completed).toBe(false)

    // Append more and signal — only the delta is sent.
    buffer = "aaabbb"
    done = true
    fire?.()
    await sleep(10)

    expect(logChunks(events).map((c) => c.content)).toEqual(["aaa", "bbb"])
    expect(completed).toBe(true)
  })

  it("unsubscribes the underlying listener on teardown", async () => {
    let unsubscribed = false
    const read = async (): Promise<RunLogChunk> => ({ content: "", nextOffset: 0, done: false })
    const sub = streamRunLog(0, read, () => () => {
      unsubscribed = true
    }).subscribe({ next: () => {} })
    await sleep(10)
    sub.unsubscribe()
    expect(unsubscribed).toBe(true)
  })
})

describe("fromRunStatus", () => {
  it("projects each run into a scoped invalidation event", async () => {
    let emit: ((run: { id: string; state: string }) => void) | undefined
    const stream = fromRunStatus<{ id: string; state: string }>(
      "agent-runs",
      (listener) => {
        emit = listener
        return () => {}
      },
      (run) => ({ runId: run.id, status: run.state }),
    )

    const events: MessageEvent[] = []
    stream.subscribe({ next: (e) => events.push(e) })
    emit?.({ id: "run-1", state: "running" })

    expect(JSON.parse(String(events[0]?.data))).toEqual({
      scope: "agent-runs",
      runId: "run-1",
      status: "running",
    })
  })
})
