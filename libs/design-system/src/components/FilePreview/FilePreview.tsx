import type { ReactNode } from "react";
import type { IconName } from "../../assets/icons";
import { formatFileSize } from "../../utils/formatFileSize";
import { Container } from "../Container/Container";
import { Icon } from "../Icon/Icon";
import { Stack } from "../Stack/Stack";
import { Typography } from "../Typography/Typography";

export enum FilePreviewTestId {
  Root = "file-preview-root",
  Icon = "file-preview-icon",
  Name = "file-preview-name",
  Size = "file-preview-size",
  Remove = "file-preview-remove",
}

const CODE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "cpp",
  "css",
  "html",
  "sh",
  "yml",
  "yaml",
]);
const VIDEO_EXT = new Set(["mp4", "mov", "webm", "mkv", "avi"]);
const DOC_EXT = new Set(["md", "txt", "pdf", "doc", "docx", "rtf", "csv", "tsv", "xls", "xlsx"]);

/** Coarse extension/MIME → existing IconName. Default `file`. (Icon union is abstract.) */
export function iconForFile(name: string, mediaType?: string): IconName {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mediaType?.startsWith("video/") || VIDEO_EXT.has(ext)) return "film";
  if (CODE_EXT.has(ext)) return "code";
  if (DOC_EXT.has(ext) || mediaType?.startsWith("text/")) return "doc";
  return "file";
}

export interface FilePreviewProps {
  name: string;
  size: number;
  mediaType?: string;
  /** When set, renders a remove button that calls this. */
  onRemove?: () => void;
  /** Optional trailing status slot (e.g. an uploading spinner or error). */
  status?: ReactNode;
}

/** One attached-file row: type icon + name (truncated) + human size, optional remove/status. */
export function FilePreview({ name, size, mediaType, onRemove, status }: FilePreviewProps) {
  return (
    <Stack align="center" data-testid={FilePreviewTestId.Root} direction="row" gap="75">
      <Icon
        aria-hidden
        data-testid={FilePreviewTestId.Icon}
        name={iconForFile(name, mediaType)}
        size="sm"
        tone="faint"
      />
      <Container grow minW0>
        <Typography
          mono
          truncate
          data-testid={FilePreviewTestId.Name}
          size="xs"
          type="note"
          variant="secondary"
        >
          {name}
        </Typography>
      </Container>
      <Typography mono data-testid={FilePreviewTestId.Size} size="2xs" type="note" variant="tertiary">
        {formatFileSize(size)}
      </Typography>
      {status}
      {onRemove ? (
        <button
          aria-label={`Remove ${name}`}
          data-testid={FilePreviewTestId.Remove}
          onClick={onRemove}
          type="button"
        >
          <Icon aria-hidden name="x" size="xs" tone="faint" />
        </button>
      ) : null}
    </Stack>
  );
}
