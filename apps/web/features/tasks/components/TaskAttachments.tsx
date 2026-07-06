"use client";
import type { Attachment } from "@zibby/contracts";
import { DropZone, FilePreview, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useUploadTaskAttachmentsMutation } from "../mutations/useUploadTaskAttachmentsMutation";

export interface TaskAttachmentSet {
  attachmentSetId?: string;
  files: Attachment[];
}

export interface TaskAttachmentsProps {
  value: TaskAttachmentSet;
  onChange: (next: TaskAttachmentSet) => void;
}

/**
 * Attach files to a task: drop/pick uploads immediately via
 * `useUploadTaskAttachmentsMutation`, then bubbles the resulting
 * `{ attachmentSetId, files }` up to the composer. v1 is a single-set model —
 * there's no merge, dropping a new batch or removing the existing one both
 * just replace the whole set.
 */
export function TaskAttachments({ value, onChange }: TaskAttachmentsProps) {
  const t = useTranslations("tasks.attachments");
  const upload = useUploadTaskAttachmentsMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleDrop(files: File[]) {
    setError(null);
    try {
      const set = await upload.mutateAsync(files);
      onChange({ attachmentSetId: set.attachmentSetId, files: set.files });
    } catch {
      setError(t("error"));
    }
  }

  function handleDropRejected() {
    setError(t("error"));
  }

  function handleRemove() {
    onChange({ files: [] });
  }

  return (
    <Stack gap="75">
      <Typography size="xs" type="note" variant="tertiary">
        {t("label")}
      </Typography>
      <DropZone
        multiple
        activeLabel={t("dropActiveHint")}
        idleLabel={t("dropHint")}
        maxSize={10 * 1024 * 1024}
        onDrop={handleDrop}
        onDropRejected={handleDropRejected}
        rejectedLabel={t("dropRejectedHint")}
      />
      {upload.isPending && (
        <Typography size="xs" type="note" variant="tertiary">
          {t("uploading")}
        </Typography>
      )}
      {error && (
        <Typography size="xs" tone="bad" type="note">
          {error}
        </Typography>
      )}
      {value.files.length > 0 && (
        <Stack gap="50">
          {value.files.map((file) => (
            <FilePreview
              key={file.name}
              mediaType={file.mediaType}
              name={file.name}
              onRemove={handleRemove}
              size={file.size}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
