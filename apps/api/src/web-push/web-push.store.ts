import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { WebPushSubscription } from "@zibby/contracts";
import { WebPushSubscriptionSchema } from "@zibby/contracts";
import webpush from "web-push";
import { z } from "zod";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token for the directory holding `vapid.json`, `subscriptions.json`, `deliveries.jsonl`. */
export const WEB_PUSH_DIR = "WEB_PUSH_DIR";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

const VapidSchema = z.object({ publicKey: z.string().min(1), privateKey: z.string().min(1) });

/**
 * The web-push files: VAPID keys (generated on first use, 0600), the browser
 * subscriptions and the append-only delivery log (Law 5).
 */
@Injectable()
export class WebPushStore {
  private vapidCache: Promise<VapidKeys> | null = null;

  constructor(@Inject(WEB_PUSH_DIR) private readonly dir: string) {}

  /** Caches the promise, so concurrent first calls generate one key pair. */
  vapid(): Promise<VapidKeys> {
    this.vapidCache ??= this.loadVapid().catch((e: unknown) => {
      this.vapidCache = null; // don't cache a failure forever
      throw e;
    });
    return this.vapidCache;
  }

  private async loadVapid(): Promise<VapidKeys> {
    const file = path.join(this.dir, "vapid.json");
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    const parsed = VapidSchema.safeParse(raw === null ? null : safeJson(raw));
    if (parsed.success) return parsed.data;
    const keys = webpush.generateVAPIDKeys();
    await ensureDir(this.dir);
    // mode at creation: the private key is never readable by others, not even briefly
    await fs.writeFile(file, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
    return keys;
  }

  async list(): Promise<WebPushSubscription[]> {
    const raw = await fs
      .readFile(path.join(this.dir, "subscriptions.json"), "utf8")
      .catch(() => "");
    const parsed = z.array(WebPushSubscriptionSchema).safeParse(raw ? safeJson(raw) : []);
    return parsed.success ? parsed.data : [];
  }

  private async write(subs: WebPushSubscription[]): Promise<void> {
    await ensureDir(this.dir);
    await writeFileAtomic(
      path.join(this.dir, "subscriptions.json"),
      `${JSON.stringify(subs, null, 2)}\n`,
    );
  }

  /** Upsert by endpoint (a re-subscribe replaces the keys). */
  async add(sub: WebPushSubscription): Promise<void> {
    const rest = (await this.list()).filter((s) => s.endpoint !== sub.endpoint);
    await this.write([...rest, sub]);
  }

  async remove(endpoint: string): Promise<void> {
    await this.write((await this.list()).filter((s) => s.endpoint !== endpoint));
  }

  async appendDelivery(line: object): Promise<void> {
    await ensureDir(this.dir);
    await fs.appendFile(
      path.join(this.dir, "deliveries.jsonl"),
      `${JSON.stringify(line)}\n`,
      "utf8",
    );
  }
}
