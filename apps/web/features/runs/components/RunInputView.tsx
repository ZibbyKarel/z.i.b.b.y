"use client";

import { Container, Divider, FilePreview, Markdown, Stack, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { API_URL } from "../../../state/api";
import type { RunView } from "../run";

export enum RunInputViewTestId {
  Root = "run-input-view",
  Attachment = "run-input-attachment",
}

export interface RunInputViewProps {
  run: RunView;
}

/** The open-file serve URL for one attachment (`GET /api/tasks/attachments/:setId/:name`). */
export function attachmentOpenHref(attachmentSetId: string, name: string): string {
  return `${API_URL}/api/tasks/attachments/${attachmentSetId}/${encodeURIComponent(name)}`;
}

/** The INPUT view: the task text as escaped markdown, then its attachments (openable when the run has a set id). */
export function RunInputView({ run }: RunInputViewProps) {
  const t = useTranslations("tasks.attachments");
  const attachments = run.attachments ?? [];
  const setId = run.attachmentSetId;
  return (
    <Container data-testid={RunInputViewTestId.Root} maxWidth="760px">
      <Stack gap="150">
        {run.taskText && <Markdown escapeHtml source={run.taskText} />}
        {attachments.length > 0 && (
          <Stack gap="75">
            <Divider />
            <Typography as="span" type="labelSm">
              {t("sectionTitle")}
            </Typography>
            {attachments.map((a) => (
              <Container data-testid={RunInputViewTestId.Attachment} key={a.name}>
                <FilePreview
                  href={setId ? attachmentOpenHref(setId, a.name) : undefined}
                  mediaType={a.mediaType}
                  name={a.name}
                  size={a.size}
                />
              </Container>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
