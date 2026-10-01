import { z } from "zod";
import { QaIssueSchema } from "../schemas.ts";
import type { QaIssue } from "../schemas.ts";
import type { VisionInput } from "./vision.ts";

export const VerdictSchema = z.object({ passed: z.boolean(), issues: z.array(QaIssueSchema) });

/** JSON schema handed to Ollama's `format`. */
export const VERDICT_JSON_SCHEMA = {
  type: "object",
  properties: {
    passed: { type: "boolean" },
    issues: {
      type: "array",
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

export function qaPrompt(input: VisionInput): string {
  return `You are a strict quality inspector for children's coloring book pages (8.5x11 in, printed in black and white).
Expected subjects: ${input.expectedSubjects.join(", ") || "(unspecified)"}.
Style guide: ${input.styleGuide}

Pixel checks already measured gray, open outlines and margins - do NOT judge those.
Report ONLY real violations of these (an empty list when there are none):
- wrong-subject: a toddler would not recognise the expected subject. A cute, simplified
  or stylised version IS the subject.
- text-artifact: visible letters, numbers or watermarks.
- unsafe: scary or violent content (weapons, injury, frightening faces). Never use it
  for a subject mismatch or for size or detail problems.
- too-complex: dozens of tiny regions a toddler cannot colour.
Set passed=true only when there are no issues of severity medium or high.
Answer with JSON: {"passed": boolean, "issues": [{"type", "severity", "description"}]}.`;
}

/** Issue types a vision model judges; the rest are pixel QA's (deterministic). */
const VISION_OWNED = new Set([
  "wrong-subject",
  "text-artifact",
  "unsafe",
  "too-complex",
  "judge-error",
]);

/**
 * Small local models list non-issues ("low: no text, fine") and re-judge what pixel QA
 * measured. Keep only medium+ issues of vision-owned types and derive `passed` from them.
 */
export const strictVerdict = (v: { passed: boolean; issues: QaIssue[] }) => {
  const issues = v.issues.filter((i) => i.severity !== "low" && VISION_OWNED.has(i.type));
  return { passed: issues.length === 0, issues };
};

export const judgeError = (description: string): { passed: false; issues: QaIssue[] } => ({
  passed: false,
  issues: [{ type: "judge-error", severity: "high", description }],
});
