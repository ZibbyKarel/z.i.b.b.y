/** Appended to every coloring-page prompt by the real providers. */
export const COLORING_SUFFIX =
  "black and white coloring book page, thick clean black outlines, pure white background, no shading, no gray, no color, no text";

/** Appended to the cover prompt instead: the cover is the one full-colour image. */
export const COVER_SUFFIX =
  "full-colour children's book cover illustration, vibrant saturated flat colours, coloured background edge to edge, bold dark outlines, no text, no letters, no words";

/** The prompt a real provider sends: the item's prompt plus the page or cover suffix. */
export const promptFor = (item: { key: string; prompt: string }): string =>
  `${item.prompt}. ${item.key === "cover" ? COVER_SUFFIX : COLORING_SUFFIX}`;

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
