import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const FAKE_BLUECODE_KEY = "sk-test-0000000000000000000000";

/**
 * Test helper: a temp AI_PROVIDERS_DIR, optionally holding a configured `bluecode.json`.
 * Returns the dir; `restore()` resets the env var and removes it.
 */
export async function withBlueCodeDir(configured: boolean) {
  const saved = process.env.AI_PROVIDERS_DIR;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bluecode-test-"));
  process.env.AI_PROVIDERS_DIR = dir;
  if (configured) {
    await fs.writeFile(
      path.join(dir, "bluecode.json"),
      JSON.stringify({
        baseUrl: "https://bluecode.example.test/projects/p1/v1",
        apiKey: FAKE_BLUECODE_KEY,
        models: {
          "llmfactory:local:GLM-5.3": {
            name: "GLM",
            variants: { low: {}, medium: { disabled: true }, high: {} },
          },
        },
      }),
    );
    // The store writes this at save time; the fixture writes it directly.
    await fs.writeFile(path.join(dir, "bluecode-probe.json"), '{"provider":{"bluecode":{}}}', {
      mode: 0o600,
    });
  }
  return {
    dir,
    restore: async () => {
      if (saved === undefined) delete process.env.AI_PROVIDERS_DIR;
      else process.env.AI_PROVIDERS_DIR = saved;
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}
