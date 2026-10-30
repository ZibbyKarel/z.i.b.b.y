import { z } from "zod";
import { QaIssueSchema } from "../schemas.ts";
import type { QaIssue } from "../schemas.ts";
import type { VisionInput } from "./vision.ts";

const CountSchema = z.object({ feature: z.string(), seen: z.number() });
export const VerdictSchema = z.object({
  /** Sheet checks only: the judge counts every number in the spec before it decides. */
  counts: z.array(CountSchema).optional(),
  passed: z.boolean(),
  issues: z.array(QaIssueSchema),
});

/** JSON schema handed to LM Studio's `response_format`. */
export const VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    issues: {
      type: "array",
      // Thinking models can loop listing issues until max_tokens cuts the JSON off.
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: QaIssueSchema.shape.type.options },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          description: { type: "string" },
        },
        required: ["type", "severity", "description"],
      },
    },
  },
  required: ["passed", "issues"],
};

/** Sheet variant: blind counts are required and come first, before the model commits to a verdict. */
export const SHEET_VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    counts: {
      type: "array",
      items: {
        type: "object",
        properties: { feature: { type: "string" }, seen: { type: "integer" } },
        required: ["feature", "seen"],
      },
    },
    ...VERDICT_JSON_SCHEMA.properties,
  },
  required: ["counts", "passed", "issues"],
};

export function qaPrompt(input: VisionInput): string {
  if (input.characterSpec)
    return sheetQaPrompt(input.characterSpec, Object.keys(input.characterCounts ?? {}));
  return `You are a strict quality inspector for children's coloring book pages (8.5x11 in, printed in black and white).
Expected subjects: ${input.expectedSubjects.join(", ") || "(unspecified)"}.
Style guide: ${input.styleGuide}
${characterRules(input)}
Pixel checks already measured gray, open outlines and margins - do NOT judge those.
Report ONLY real violations of these (an empty list when there are none):
- wrong-subject: a toddler would not recognise the expected subject. A cute, simplified
  or stylised version IS the subject.
- text-artifact: visible letters, numbers or watermarks.
- unsafe: scary or violent content (weapons, injury, frightening faces). Never use it
  for a subject mismatch or for size or detail problems.
- too-complex: dozens of tiny regions a toddler cannot colour.${input.characters?.length ? "\n- off-model: a recurring character breaks the character rules above (severity high)." : ""}
Set passed=true only when there are no issues of severity medium or high.
Answer with JSON: {"passed": boolean, "issues": [{"type", "severity", "description"}]}.`;
}

/** Page check of recurring characters: the design, the reference image and the scene's rules. */
function characterRules(input: VisionInput): string {
  if (!input.characters?.length) return "";
  const who = input.characters.map((c, i) => `${i + 1}) ${c.label}: ${c.spec}`).join("\n");
  return `
Recurring characters on this page${input.referenceImage ? " (the SECOND image is their approved reference sheet, left to right)" : ""}:
${who}
${input.scene ? `The page was drawn from this description: ${input.scene}\n` : ""}Character rules - check each one for every character:
- each character appears exactly as many times as the description says (no clones, no extra copies);
- each looks like its design${input.referenceImage ? " and the reference sheet" : ""}: same head, ears, face, hair, clothes and hat
  (the sheet shows the design only - a different pose, size or position on the page is fine);
  a character never wears or has another character's features (hat, pigtails, ears, tail, moustache);
- relative sizes follow the description;
- nothing the design says the character never has.
`;
}

const NUMBER =
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|single|double|pair of|exactly)\b/gi;

/**
 * A character reference sheet: one character, checked against its spec. Small vision models
 * copy a number they are told instead of counting, so the spec goes in with its numbers
 * blanked and the judge counts the listed features blind; the tool compares (countIssues).
 */
function sheetQaPrompt(spec: string, features: string[]): string {
  const count =
    features.length === 0
      ? ""
      : `First fill "counts": count each of these in the image, one by one, one integer each - do not guess;\nuse each feature text exactly as written:
${features.map((f) => `- ${f}`).join("\n")}
`;
  return `You are a strict model-sheet checker for a children's coloring book (black and white line art).
The image is the reference drawing of ONE recurring character. Its design (numbers left out):
${spec.replace(NUMBER, "").replace(/\s+/g, " ")}

${count}Then check: there is exactly one character; every feature the design names is present;
the shapes and clothes match; the character has nothing the design says it never has. Report
every mismatch as off-model, severity high, naming the feature and what you see. Do not report
counts in issues. Also report text-artifact (drawn letters or digits) and unsafe content.
Set passed=true only when there are no issues of severity medium or high.
Answer with JSON: {"counts": [{"feature", "seen"}], "passed": boolean, "issues": [{"type", "severity", "description"}]}.`;
}

/** Issue types a vision model judges; the rest are pixel QA's (deterministic). */
const VISION_OWNED = new Set([
  "wrong-subject",
  "off-model",
  "text-artifact",
  "unsafe",
  "too-complex",
  "judge-error",
]);

/**
 * Small local models list non-issues ("low: no text, fine") and re-judge what pixel QA
 * measured. Keep only medium+ issues of vision-owned types and derive `passed` from them.
 */
export const strictVerdict = (
  v: z.infer<typeof VerdictSchema>,
  expected: Record<string, number> = {},
) => {
  const issues = [
    ...v.issues.filter((i) => i.severity !== "low" && VISION_OWNED.has(i.type)),
    ...countIssues(v.counts, expected),
  ];
  return { passed: issues.length === 0, issues };
};

/** Blind counts vs the spec's numbers; a feature the judge did not count is not a finding. */
export const countIssues = (
  counts: z.infer<typeof CountSchema>[] = [],
  expected: Record<string, number> = {},
): QaIssue[] =>
  Object.entries(expected).flatMap(([feature, want]) => {
    const seen = counts.find((c) => c.feature.trim().toLowerCase() === feature.toLowerCase())?.seen;
    return seen === undefined || seen === want
      ? []
      : [
          {
            type: "off-model" as const,
            severity: "high" as const,
            description: `${feature}: spec says ${want}, drawn ${seen}`,
          },
        ];
  });

export const judgeError = (description: string): { passed: false; issues: QaIssue[] } => ({
  passed: false,
  issues: [{ type: "judge-error", severity: "high", description }],
});
