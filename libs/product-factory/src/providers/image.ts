/** Appended to every coloring-page prompt by the real providers. */
export const COLORING_SUFFIX =
  "black and white coloring book page, thick clean black outlines, pure white background, no shading, no gray, no color, no text";

export interface ImageItem {
  key: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  referenceImages?: string[];
  /** 1-based attempt for this key (lets test providers vary behaviour). */
  attempt?: number;
}

export interface ImageResult {
  key: string;
  file: string;
  durationMs: number;
  costUsd: number;
}

export interface ImageProvider {
  id: string;
  model: string;
  /** Batch call so a local model can stay loaded for the whole batch. Files are written into outDir. */
  generateBatch(items: ImageItem[], outDir: string): Promise<ImageResult[]>;
  /** Optional: release memory (unload models) after the phase. */
  dispose?(): Promise<void>;
}
