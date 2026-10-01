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

Checklist - report an issue for every violation:
- Lines are pure black on a white background (gray-area: any gray fill, shading, gradient or colour).
- Every shape a toddler would colour is a closed contour (open-contour: gaps in outlines).
- The page is not too busy (too-complex) and not nearly empty (too-sparse).
- The image shows the expected subjects (wrong-subject).
- No text, letters, numbers or watermarks (text-artifact).
- Nothing touches or is cut off at the page margins (margin-violation).
- Nothing scary or violent: weapons, injury, frightening faces (unsafe). Size or detail problems are never unsafe - use too-complex instead.
Set passed=true only when there are no issues of severity medium or high.
Answer with JSON: {"passed": boolean, "issues": [{"type", "severity", "description"}]}.`;
}

export const judgeError = (description: string): { passed: false; issues: QaIssue[] } => ({
  passed: false,
  issues: [{ type: "judge-error", severity: "high", description }],
});
