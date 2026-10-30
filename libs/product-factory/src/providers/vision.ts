import type { QaIssue } from "../schemas.ts";

export interface VisionInput {
  file: string;
  pageNumber: number;
  expectedSubjects: string[];
  styleGuide: string;
  /** Set for a character reference sheet: the image must match this spec feature by feature. */
  characterSpec?: string;
  /** Page only: the recurring characters drawn on it, checked against their design. */
  characters?: { label: string; spec: string }[];
  /** Page only: the approved character sheets side by side, sent as a second image. */
  referenceImage?: string;
  /** Page only: the generation prompt, which carries the scene's size and count rules. */
  scene?: string;
  /** Sheet only: what to count and the expected number (the judge is never told the number). */
  characterCounts?: Record<string, number>;
}

export interface VisionVerdict {
  passed: boolean;
  issues: QaIssue[];
  durationMs: number;
  costUsd: number;
}

export interface VisionProvider {
  id: "mock" | "lmstudio" | "haiku";
  model: string;
  judge(input: VisionInput): Promise<VisionVerdict>;
  /** Optional: release memory (unload models) after the phase. */
  dispose?(): Promise<void>;
}
