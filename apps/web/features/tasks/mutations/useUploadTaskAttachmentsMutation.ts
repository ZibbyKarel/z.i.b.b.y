import { useMutation } from "@tanstack/react-query";
import type { Attachment } from "@zibby/contracts";
import { API_URL } from "../../../state/api";

export interface UploadedSet {
  attachmentSetId: string;
  files: Attachment[];
}

/**
 * Upload files for a task (`POST /api/tasks/attachments`) as multipart
 * `FormData`. Goes over raw `fetch` rather than the ts-rest client: the route
 * is multipart, not JSON, and the browser must set its own `Content-Type`
 * boundary — no header is set here.
 *
 * Posts to the API origin (`API_URL`), never a bare relative path — the API
 * is a separate server from the Next.js app, with no `/api` rewrite/proxy.
 */
export function useUploadTaskAttachmentsMutation() {
  return useMutation<UploadedSet, Error, File[]>({
    mutationFn: async (files) => {
      const form = new FormData();
      for (const file of files) form.append("files", file, file.name);
      const res = await fetch(`${API_URL}/api/tasks/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      return (await res.json()) as UploadedSet;
    },
  });
}
