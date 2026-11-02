import { z } from "zod";

/** One provider's status — the key itself is write-only; only its last 4 chars are echoed. */
export const AiProviderStatusSchema = z.object({
  configured: z.boolean(),
  keyHint: z.string().optional(),
});
export type AiProviderStatus = z.infer<typeof AiProviderStatusSchema>;

export const AiProvidersStatusSchema = z.object({ openai: AiProviderStatusSchema });
export type AiProvidersStatus = z.infer<typeof AiProvidersStatusSchema>;

export const SetOpenAiKeyInputSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20)
    .refine((v) => v.startsWith("sk-"), { message: 'must start with "sk-"' }),
});
export type SetOpenAiKeyInput = z.infer<typeof SetOpenAiKeyInputSchema>;
