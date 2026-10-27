/** Appended to every coloring-page prompt by the real providers. */
export const COLORING_SUFFIX =
  "black and white coloring book page, thick clean black outlines, pure white background, no shading, no gray, no color, no text";

/** Appended to the cover prompt instead: the cover is the one full-colour image. */
export const COVER_SUFFIX =
  "full-colour children's book cover illustration, vibrant saturated flat colours, coloured background edge to edge, bold dark outlines, no text, no letters, no words";

/** Appended to a title-buddy sticker: one coloured character, cut out from a white background. */
export const STICKER_SUFFIX =
  "full-colour flat vector sticker, saturated flat colours, bold dark outline closed all around the character, plain pure white background, nothing else, no shadow, no text";

/** Item keys: `cover`, `buddy-<n>` (sticker), anything else is a black-and-white line-art image. */
const suffixOf = (key: string): string =>
  key === "cover" ? COVER_SUFFIX : key.startsWith("buddy-") ? STICKER_SUFFIX : COLORING_SUFFIX;

/** The prompt a real provider sends: the item's prompt plus the page, cover or sticker suffix. */
export const promptFor = (item: { key: string; prompt: string }): string =>
  `${item.prompt}. ${suffixOf(item.key)}`;

export interface ImageItem {
  key: string;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  /** PNGs the model must keep the characters of (image-conditioned editing). */
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
