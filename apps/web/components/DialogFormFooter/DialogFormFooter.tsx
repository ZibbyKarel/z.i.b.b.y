import { Button } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export interface DialogFormFooterProps {
  /** Create vs edit mode — drives the submit glyph/label and whether delete shows. */
  isNew: boolean;
  /** Disables submit until the form is valid. */
  canSave: boolean;
  /** Submit label in create mode (the per-resource string, e.g. `t("hooks.create")`). */
  createLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  /** When given (and in edit mode), renders the leading danger Delete action. */
  onDelete?: () => void;
  /** Test id for the submit button (the per-dialog `*FormTestId.Submit`). */
  submitTestId?: string;
}

/**
 * The shared create/edit dialog footer: an optional leading danger Delete (edit
 * mode only), a ghost Cancel, and a primary Submit. Cancel/Save/Delete read from
 * the `common.*` catalog; the create-mode label is passed in so each resource
 * keeps its own string. Used for the resource form dialogs whose footer was
 * byte-identical (hooks, MCP, integrations).
 */
export function DialogFormFooter({
  isNew,
  canSave,
  createLabel,
  onClose,
  onSubmit,
  onDelete,
  submitTestId,
}: DialogFormFooterProps) {
  const t = useTranslations();
  return (
    <>
      {!isNew && onDelete && (
        <Button icon="trash" intent="danger" onClick={onDelete}>
          {t("common.delete")}
        </Button>
      )}
      <Button intent="ghost" onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button
        data-testid={submitTestId}
        disabled={!canSave}
        icon={isNew ? "plus" : "check"}
        intent="primary"
        onClick={onSubmit}
      >
        {isNew ? createLabel : t("common.save")}
      </Button>
    </>
  );
}
