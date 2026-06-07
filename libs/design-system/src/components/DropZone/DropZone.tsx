import { useDropzone } from "react-dropzone";
import type { Accept, FileRejection } from "react-dropzone";
import { cn } from "../../utils/cn";
import { Icon } from "../Icon/Icon";

export { type FileRejection };

/** Map of MIME types to their file extensions, e.g. `{ "image/*": [".png", ".jpg"] }`. */
export type FileAccept = Accept;

export enum DropZoneTestId {
  Root = "dropzone-root",
  Input = "dropzone-input",
  Hint = "dropzone-hint",
}

export interface DropZoneProps {
  /** Called with the accepted files when the user drops or picks them. */
  onDrop: (acceptedFiles: File[]) => void;
  /** Called when files are rejected (type/size mismatch). */
  onDropRejected?: (rejections: FileRejection[]) => void;
  /** Restrict accepted file types. */
  accept?: FileAccept;
  /** Allow picking more than one file at a time. Defaults to `true`. */
  multiple?: boolean;
  disabled?: boolean;
  /** Maximum individual file size in bytes. */
  maxSize?: number;
  /** Marks the control as invalid (adds a red border). */
  invalid?: boolean;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

export function DropZone({
  onDrop,
  onDropRejected,
  accept,
  multiple = true,
  disabled = false,
  maxSize,
  invalid = false,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: DropZoneProps) {
  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop,
    onDropRejected,
    accept,
    multiple,
    disabled,
    maxSize,
  });

  const iconTone =
    isDragActive && isDragAccept ? "accent"
    : isDragActive && isDragReject ? "bad"
    : "faint";

  return (
    <div
      {...getRootProps()}
      aria-describedby={ariaDescribedBy}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3",
        "rounded border-2 border-dashed border-border bg-background p-8",
        "outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        isDragActive && isDragAccept && "border-accent bg-accent/5",
        isDragActive && isDragReject && "border-bad bg-bad/10",
        invalid && !isDragActive && "border-bad",
        disabled && "cursor-not-allowed opacity-50",
      )}
      data-testid={DropZoneTestId.Root}
    >
      <input {...getInputProps()} data-testid={DropZoneTestId.Input} />
      <Icon aria-hidden name="file" size="lg" stroke="thin" tone={iconTone} />
      <span
        className="font-mono text-sm text-foreground-faint"
        data-testid={DropZoneTestId.Hint}
      >
        {isDragActive
          ? isDragReject
            ? "Typ souboru není povolen"
            : "Pusťte soubory sem"
          : "Přetáhněte soubory nebo klikněte pro výběr"}
      </span>
    </div>
  );
}
