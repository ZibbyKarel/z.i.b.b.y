import { createFalImageProvider } from "./fal.ts";
import { createHaikuVisionProvider } from "./haiku.ts";
import { createMfluxImageProvider } from "./mflux.ts";
import { createMockImageProvider, mockVisionProvider } from "./mock.ts";
import { createOllamaVisionProvider } from "./ollama.ts";
import type { ImageProvider } from "./image.ts";
import type { VisionProvider } from "./vision.ts";

export function createImageProvider(env: NodeJS.ProcessEnv): ImageProvider {
  const id = env.PF_IMAGE_PROVIDER ?? "mock";
  if (id === "mock") return createMockImageProvider(env);
  if (id === "mflux") return createMfluxImageProvider(env);
  if (id === "fal") return createFalImageProvider(env);
  throw new Error(`unknown PF_IMAGE_PROVIDER "${id}" (mock|mflux|fal)`);
}

/** null = pixel QA only. */
export function createVisionProvider(env: NodeJS.ProcessEnv): VisionProvider | null {
  const id = env.PF_VISION_PROVIDER ?? "none";
  if (id === "none") return null;
  if (id === "mock") return mockVisionProvider;
  if (id === "ollama") return createOllamaVisionProvider(env);
  if (id === "haiku") return createHaikuVisionProvider(env);
  throw new Error(`unknown PF_VISION_PROVIDER "${id}" (none|mock|ollama|haiku)`);
}
