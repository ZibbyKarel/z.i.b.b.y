"use client";

import type { RoadmapItemLevel } from "@zibby/contracts";
import {
  Button,
  Dialog,
  DropZone,
  MarkdownEditor,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCreateRoadmapItemMutation } from "../mutations";

export enum RoadmapItemFormDialogTestId {
  Root = "roadmap-item-form-dialog",
  Name = "roadmap-item-form-name",
  Description = "roadmap-item-form-description",
  Error = "roadmap-item-form-error",
  Save = "roadmap-item-form-save",
}

export interface RoadmapItemFormDialogProps {
  projectId: string;
  /** Whether this creates an epic or a task ("Nový epik" / "Nový task"). */
  level: RoadmapItemLevel;
  /**
   * The epic this task is created under — the operator's currently selected
   * epic on the panel, never user-editable here. Absent for `level === "epic"`.
   */
  parentId?: string;
  onClose: () => void;
  /** Called with the newly created item's id so the caller can select it. */
  onCreated?: (itemId: string) => void;
}

/** Only `.md` files fill the editor — anything else is rejected with a visible message. */
const MARKDOWN_ACCEPT = { "text/markdown": [".md"] };

/**
 * "Nový epik" / "Nový task" (125f, master plan "Manual create"): a markdown
 * editor mirroring `NoteEditorDialog` (name + `MarkdownEditor` body), plus drag
 * & drop of a `.md` file whose content fills the editor — the same `DropZone`
 * idiom `TaskAttachments` uses (idle/active/rejected hints, an explicit
 * `onDropRejected` message instead of silently ignoring a non-`.md` file).
 * Unlike `TaskAttachments`, the dropped file is never uploaded as an
 * attachment — its text content is read locally (a `FileReader`, same
 * precedent as `ProjectBasicsPanel`'s logo upload) and becomes the
 * description body, since this dialog has no attachment concept at all
 * (`CreateRoadmapItemSchema` carries no `attachmentSetId`).
 *
 * A task is always created under the already-selected epic (`parentId`) —
 * there is no epic picker here. The server 422s when `parentId` doesn't
 * resolve to an existing epic (e.g. it was deleted between selection and
 * submit); that message is surfaced verbatim rather than swallowed.
 */
export function RoadmapItemFormDialog({
  projectId,
  level,
  parentId,
  onClose,
  onCreated,
}: RoadmapItemFormDialogProps) {
  const t = useTranslations("roadmap");
  const tk = useTranslations();
  const createMut = useCreateRoadmapItemMutation(projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dropError, setDropError] = useState<string | null>(null);

  const dialogTitle = level === "epic" ? t("create.epicTitle") : t("create.taskTitle");
  const canSave = name.trim().length > 0 && !createMut.isPending;

  function handleDrop(files: File[]) {
    const file = files[0];
    if (!file) return;
    setDropError(null);
    // `FileReader` (not `file.text()`) — mirrors `ProjectBasicsPanel`'s
    // `handleLogoFile` precedent, and works across every DOM/jsdom target
    // this app tests against.
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : null;
      if (text != null) setDescription(text);
      else setDropError(t("create.dropError"));
    };
    reader.onerror = () => setDropError(t("create.dropError"));
    reader.readAsText(file);
  }

  function handleDropRejected() {
    setDropError(t("create.dropRejected"));
  }

  function save() {
    createMut.mutate(
      {
        params: { projectId },
        body: { level, name: name.trim(), description, parentId },
      },
      {
        onSuccess: (result) => {
          onCreated?.(result.body.id);
          onClose();
        },
      },
    );
  }

  // `createMut.error` is a known `{ status: 409 | 422, body }` error response
  // (both carry `ErrorSchema`'s `{ message }`), a `{ status, body: unknown }`
  // fallback for an error status the route doesn't declare, or a bare network
  // `Error` — surface the server's own message only when the status is one we
  // know actually carries `ErrorSchema`, a generic fallback otherwise.
  const submitError = (() => {
    if (!createMut.isError) return null;
    const err = createMut.error;
    if ("status" in err && (err.status === 409 || err.status === 422)) {
      return err.body.message;
    }
    return t("create.error");
  })();

  const actions = (
    <Stack align="center" direction="row" gap="100" justify="end">
      <Button intent="ghost" onClick={onClose}>
        {tk("common.cancel")}
      </Button>
      <Button
        data-testid={RoadmapItemFormDialogTestId.Save}
        disabled={!canSave}
        icon="plus"
        loading={createMut.isPending}
        onClick={save}
      >
        {tk("common.save")}
      </Button>
    </Stack>
  );

  return (
    <Dialog
      open
      actions={actions}
      ariaLabel={dialogTitle}
      closeLabel={tk("common.close")}
      onClose={onClose}
      title={dialogTitle}
      width="lg"
    >
      <Stack data-testid={RoadmapItemFormDialogTestId.Root} gap="200">
        <TextInputField
          autoFocus
          data-testid={RoadmapItemFormDialogTestId.Name}
          label={t("create.nameLabel")}
          onChange={(e) => setName(e.target.value)}
          value={name}
        />

        <Stack data-testid={RoadmapItemFormDialogTestId.Description} gap="100">
          <MarkdownEditor
            ariaLabel={t("create.descriptionLabel")}
            label={t("create.descriptionLabel")}
            onChange={setDescription}
            value={description}
          />
          <DropZone
            accept={MARKDOWN_ACCEPT}
            activeLabel={t("create.dropActiveHint")}
            idleLabel={t("create.dropHint")}
            multiple={false}
            onDrop={handleDrop}
            onDropRejected={handleDropRejected}
            rejectedLabel={t("create.dropRejected")}
          />
          {dropError && (
            <Typography size="xs" tone="bad" type="note">
              {dropError}
            </Typography>
          )}
        </Stack>

        {submitError && (
          <Typography
            data-testid={RoadmapItemFormDialogTestId.Error}
            size="sm"
            tone="bad"
            type="note"
          >
            {submitError}
          </Typography>
        )}
      </Stack>
    </Dialog>
  );
}
