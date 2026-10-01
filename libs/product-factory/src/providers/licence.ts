/** Image models whose licence allows selling the output commercially. Everything else is refused before generation. */
export const ALLOWED_IMAGE_MODELS: readonly string[] = [
  "flux2-klein-4b", // Apache-2.0
  "flux2-klein-base-4b", // Apache-2.0
  "z-image-turbo", // Apache-2.0
];

/** LoRAs checked for commercial use. Empty on purpose: add Coloring-Book-Z only after checking its licence. */
export const ALLOWED_LORAS: readonly string[] = [];

export function assertLicensed(model: string): void {
  if (!ALLOWED_IMAGE_MODELS.includes(model))
    throw new Error(
      `model ${model} is not licensed for commercial use (allowed: ${ALLOWED_IMAGE_MODELS.join(", ")})`,
    );
}

export const imageModelOf = (env: NodeJS.ProcessEnv): string =>
  env.PF_IMAGE_MODEL || "flux2-klein-4b";

/** PF_IMAGE_LORA (comma separated) -> verified list; unknown LoRA throws. */
export function lorasOf(env: NodeJS.ProcessEnv): string[] {
  const loras = (env.PF_IMAGE_LORA ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const l of loras)
    if (!ALLOWED_LORAS.includes(l))
      throw new Error(
        `LoRA ${l} is not licensed for commercial use (allow-list is empty or lacks it)`,
      );
  return loras;
}
