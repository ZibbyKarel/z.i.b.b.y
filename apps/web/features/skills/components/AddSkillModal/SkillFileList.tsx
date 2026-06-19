"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Container,
  Divider,
  Icon,
  IconTile,
  Stack,
  Typography,
} from "@zibby/design-system";
import type { LoadedFile } from "../../hooks/useSkillFileList";

export interface SkillFileListProps {
  files: LoadedFile[];
  selectedCount: number;
  onToggle: (path: string) => void;
  onImport: () => void;
}

/**
 * Presentational list of the dropped skill files: a selection summary with the
 * import action, then one checkbox row per file. State lives in
 * {@link import("../../hooks/useSkillFileList").useSkillFileList}.
 */
export function SkillFileList({ files, selectedCount, onToggle, onImport }: SkillFileListProps) {
  const t = useTranslations("forms.skill");

  return (
    <Stack gap="100">
      <Stack align="center" direction="row" gap="100">
        <Container grow minW0>
          <Typography mono size="xs" type="note" variant="tertiary">
            {t("content.directory.summary", {
              total: files.length,
              selected: selectedCount,
            })}
          </Typography>
        </Container>
        <Button
          disabled={selectedCount === 0}
          icon="check"
          intent="primary"
          onClick={onImport}
          size="sm"
          type="button"
        >
          {t("content.directory.import")}
        </Button>
      </Stack>

      <Card background="background" radius="sm">
        <Container maxHeight="18rem" overflowY="auto">
          <Stack>
            {files.map((f, i) => {
              const folder = f.path.includes("/") ? f.path.split("/").slice(0, -1).join("/") : "";
              return (
                <Container key={f.path}>
                  {i > 0 && <Divider />}
                  <Container padding={["100", "150"]}>
                    <Stack align="center" direction="row" gap="100">
                      <IconTile
                        interactive
                        aria-checked={f.checked}
                        aria-label={f.name}
                        as="button"
                        filled={f.checked}
                        glyph={f.checked ? "check" : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          onToggle(f.path);
                        }}
                        role="checkbox"
                        size="sm"
                        tone={f.checked ? "accent" : "neutral"}
                      />
                      <Icon name="doc" size="sm" tone="faint" />
                      <Container grow minW0>
                        <Typography
                          mono
                          truncate
                          size="sm"
                          type="note"
                          variant={f.checked ? "primary" : "tertiary"}
                        >
                          {f.name}
                        </Typography>
                        {folder && (
                          <Typography mono truncate size="xs" type="note" variant="tertiary">
                            {folder}
                          </Typography>
                        )}
                      </Container>
                      <Typography mono size="xs" type="note" variant="tertiary">
                        {t("content.directory.fileSize", {
                          kb: (f.size / 1024).toFixed(1),
                        })}
                      </Typography>
                    </Stack>
                  </Container>
                </Container>
              );
            })}
          </Stack>
        </Container>
      </Card>
    </Stack>
  );
}
