/** Default of the `openai` image provider in libs/product-factory (PF_OPENAI_IMAGE_MODEL). */
const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-image-2.5-flare";

/**
 * The OpenAI image model a tool step generates with, or undefined when it does not use OpenAI.
 * A step uses it when one of its commands sets `PF_IMAGE_PROVIDER=openai`; a
 * `PF_OPENAI_IMAGE_MODEL=<id>` in the same command picks the model.
 */
export function toolOpenAiImageModel(commands: readonly string[] | undefined): string | undefined {
  const cmd = commands?.find((c) => /(^|\s)PF_IMAGE_PROVIDER=openai(\s|$)/.test(c));
  if (!cmd) return undefined;
  return /(^|\s)PF_OPENAI_IMAGE_MODEL=(\S+)/.exec(cmd)?.[2] ?? DEFAULT_OPENAI_IMAGE_MODEL;
}
