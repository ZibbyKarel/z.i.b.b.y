import { z } from "zod";

export const BriefSchema = z.strictObject({
  title: z.string().max(120).optional(),
  theme: z.string().min(1).max(200),
  targetAge: z
    .strictObject({ min: z.number().int().min(1).max(12), max: z.number().int().min(1).max(12) })
    .refine((a) => a.min <= a.max, "targetAge.min must be <= max"),
  language: z.enum(["en", "de", "fr", "es", "it", "cs"]).default("en"),
  // KDP minimum is 24 — below that is a preflight warning, not a schema error.
  pageCount: z.number().int().min(4).max(110),
  style: z
    .enum(["cute_simple_line_art", "bold_outline_cartoon", "storybook_line_art"])
    .default("cute_simple_line_art"),
  storyMode: z.boolean().default(false),
  trim: z.literal("8.5x11").default("8.5x11"),
  listPriceUsd: z.number().default(9.99),
  breakEvenCopies: z.number().int().default(5),
  /** The named child a personal book is about ("pro Natálku"); the book is still publishable. */
  personalFor: z.string().min(1).max(40).optional(),
});
export type Brief = z.infer<typeof BriefSchema>;

export const PageSchema = z.strictObject({
  pageNumber: z.number().int().min(1),
  scene: z.string(),
  subjects: z.array(z.string()),
  caption: z.string().max(120).optional(),
  difficulty: z.number().int().min(1).max(3),
});
export type Page = z.infer<typeof PageSchema>;

export const PlanSchema = z.strictObject({
  brief: BriefSchema,
  title: z.string(),
  subtitle: z.string().optional(),
  /** Title-page line in the brief's language (e.g. "Tahle omalovánka patří Natálce"). */
  ownerLine: z.string().max(80).optional(),
  /** Visual rules the illustrator must follow. */
  styleGuide: z.string().max(2000),
  cover: z.strictObject({ scene: z.string() }),
  pages: z.array(PageSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

export const JobSchema = z.strictObject({
  pageNumber: z.number().int().min(1),
  prompt: z.string().min(1).max(2000),
  seed: z.number().int().optional(),
  referenceImages: z.array(z.string()).optional(),
});
export type Job = z.infer<typeof JobSchema>;

export const JobsSchema = z.strictObject({
  cover: z
    .strictObject({ prompt: z.string().min(1).max(2000), seed: z.number().int().optional() })
    .optional(),
  jobs: z.array(JobSchema),
});
export type Jobs = z.infer<typeof JobsSchema>;

export const QaIssueSchema = z.strictObject({
  type: z.enum([
    "gray-area",
    "open-contour",
    "too-complex",
    "too-sparse",
    "wrong-subject",
    "text-artifact",
    "margin-violation",
    "unsafe",
    "judge-error",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string(),
});
export type QaIssue = z.infer<typeof QaIssueSchema>;

export const QaResultSchema = z.strictObject({
  pageNumber: z.number().int(),
  attempt: z.number().int(),
  passed: z.boolean(),
  pixel: z.strictObject({
    grayRatio: z.number(),
    inkRatio: z.number(),
    openRegions: z.number(),
    marginInk: z.number(),
  }),
  issues: z.array(QaIssueSchema),
  judge: z.enum(["pixel", "ollama", "haiku", "mock"]),
});
export type QaResult = z.infer<typeof QaResultSchema>;
