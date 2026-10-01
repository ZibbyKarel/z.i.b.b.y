import type { QaIssue } from "../schemas.ts";

export interface VisionInput {
  file: string;
  pageNumber: number;
  expectedSubjects: string[];
  styleGuide: string;
}

export interface VisionVerdict {
  passed: boolean;
  issues: QaIssue[];
  durationMs: number;
  costUsd: number;
}

export interface VisionProvider {
  id: "mock" | "ollama" | "haiku";
  model: string;
  judge(input: VisionInput): Promise<VisionVerdict>;
  /** Optional: release memory (unload models) after the phase. */
  dispose?(): Promise<void>;
}
