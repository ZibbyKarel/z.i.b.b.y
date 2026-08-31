"use client";

import { useTranslations } from "next-intl";
import { Button, Divider, Stack, Typography } from "@zibby/design-system";
import type { KnowledgeBaseSource } from "@zibby/contracts";
import { FormTextInput, useFormControls } from "@zibby/forms";
import { HudPanel } from "../../../components/HudPanel/HudPanel";

export interface TeamKnowledgeBasePanelProps {
  /** The team's current knowledge base; undefined when none is attached. */
  knowledgeBase?: KnowledgeBaseSource;
  saving?: boolean;
  /**
   * Persist the edited KB, or `null` to clear it entirely. `null` (not
   * `undefined`) is the explicit clear signal `UpdateTeamSchema.knowledgeBase`
   * and `TeamsStorageService.update` act on — an `undefined`-valued key is
   * dropped by JSON.stringify before the request leaves the browser, so it
   * can never express "clear" on its own.
   */
  onSave: (knowledgeBase: KnowledgeBaseSource | null) => void;
}

type KnowledgeBaseEditValues = {
  path: string;
  gitRemote: string;
};

/**
 * The team's read-only knowledge-base editor (Stage A of the team-knowledge-base
 * plan — nothing reads the KB yet, this only lets the operator attach one). The
 * union has one member today (`kind: "vault"`), so this panel offers only that
 * shape; a later `kind: "confluence"` member must not disturb this form.
 *
 * `readOnly` is NEVER rendered as a toggle/switch/checkbox — it is sent as the
 * literal `true` on every save, always. Read-only is structural (Law 1): a
 * control here would wrongly imply an operator could turn writes on.
 */
export function TeamKnowledgeBasePanel({
  knowledgeBase,
  saving,
  onSave,
}: TeamKnowledgeBasePanelProps) {
  const t = useTranslations("teams.knowledgeBase");

  const { renderForm, submit, form } = useFormControls<KnowledgeBaseEditValues>({
    defaultValues: {
      path: knowledgeBase?.path ?? "",
      gitRemote: knowledgeBase?.gitRemote ?? "",
    },
    onSubmit: (values) => {
      const path = values.path.trim();
      if (!path) return;
      onSave({
        kind: "vault",
        path,
        gitRemote: values.gitRemote.trim() || undefined,
        readOnly: true,
      });
    },
  });

  const [watchedPath] = form.watch(["path"]);
  const canSave = (watchedPath ?? "").trim().length > 0 && !saving;

  return renderForm(
    <HudPanel
      action={
        <Button
          data-testid="save-kb"
          disabled={!canSave}
          icon="check"
          intent="primary"
          onClick={() => void submit()}
          size="sm"
        >
          {t("save")}
        </Button>
      }
      title={t("title")}
    >
      <Stack gap="200">
        <FormTextInput<KnowledgeBaseEditValues>
          hint={t("pathHint")}
          label={t("path")}
          name="path"
          placeholder={t("pathPlaceholder")}
        />

        <FormTextInput<KnowledgeBaseEditValues>
          label={t("gitRemote")}
          name="gitRemote"
          placeholder={t("gitRemotePlaceholder")}
        />

        <Typography size="xs" type="note" variant="tertiary">
          {t("readOnlyNote")}
        </Typography>

        {knowledgeBase && (
          <>
            <Divider />
            <Stack align="start" direction="row">
              <Button
                data-testid="clear-kb"
                disabled={saving}
                icon="x"
                intent="ghost"
                onClick={() => onSave(null)}
                size="sm"
              >
                {t("clear")}
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </HudPanel>,
  );
}
