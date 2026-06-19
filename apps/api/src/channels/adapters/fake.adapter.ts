import { promises as fs } from "node:fs"
import * as path from "node:path"
import type { ChannelItem, CredentialsInput, Integration, TestResult } from "@zibby/contracts"
import { safeJson } from "../../shared/file-storage"
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter"

/**
 * Kind-agnostic test double for the channel seam (the `gh`-shim precedent from
 * Phase 3.3). Under `channelAdapterMode: "fake"` it stands in for every integration
 * kind, so the 5.2/5.3 suites — and the 5.4 email re-run — drive ingestion, triage
 * and replies without a network.
 *
 * Fixtures live as JSON files under `CHANNEL_FAKE_DIR/<integrationId>/*.json`
 * (falling back to the dir root), sorted lexically and consumed once via the
 * cursor (filename of the last consumed message). `send()` records each outbound
 * payload to `CHANNEL_FAKE_DIR/sent/<n>.json` so an e2e can assert exact replies.
 */
export class FakeChannelAdapter implements ChannelAdapter {
  readonly kind = "fake" as const

  private dir(): string {
    return process.env.CHANNEL_FAKE_DIR ?? path.join(process.cwd(), "channel-fake")
  }

  test(): Promise<TestResult> {
    if (process.env.CHANNEL_FAKE_TEST_FAIL) {
      return Promise.resolve({ ok: false, detail: "fake adapter forced failure" })
    }
    return Promise.resolve({ ok: true, detail: "fake adapter ok" })
  }

  async poll(
    integration: Integration,
    _creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    const base = this.dir()
    const perIntegration = path.join(base, integration.id)
    const sourceDir = (await this.isDir(perIntegration)) ? perIntegration : base

    const names = (await fs.readdir(sourceDir).catch(() => [] as string[]))
      .filter((n) => n.endsWith(".json"))
      .sort()

    const fresh = names.filter((n) => (cursor === undefined ? true : n > cursor))
    const items: InboundMessage[] = []
    for (const name of fresh) {
      const raw = await fs.readFile(path.join(sourceDir, name), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = safeJson(raw)
      if (!parsed || typeof parsed !== "object") continue
      const msg = parsed as Partial<InboundMessage> & { text?: string }
      const stem = name.replace(/\.json$/, "")
      items.push({
        id: msg.id ?? `${integration.id}-${stem}`,
        externalRef: msg.externalRef ?? { channel: integration.id, ts: stem },
        from: msg.from,
        receivedAt: msg.receivedAt ?? new Date(0).toISOString(),
        text: msg.text ?? "",
        raw: msg.raw ?? parsed,
      })
    }

    const lastName = names[names.length - 1]
    return { items, cursor: lastName ?? cursor }
  }

  async send(
    integration: Integration,
    _creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void> {
    const sentDir = path.join(this.dir(), "sent")
    await fs.mkdir(sentDir, { recursive: true })
    const existing = (await fs.readdir(sentDir).catch(() => [] as string[])).filter((n) =>
      n.endsWith(".json"),
    )
    const file = path.join(sentDir, `${existing.length}.json`)
    await fs.writeFile(
      file,
      JSON.stringify({ integrationId: integration.id, itemId: item.id, ref: item.externalRef, text }),
      "utf8",
    )
  }

  private async isDir(p: string): Promise<boolean> {
    return fs
      .stat(p)
      .then((s) => s.isDirectory())
      .catch(() => false)
  }
}
