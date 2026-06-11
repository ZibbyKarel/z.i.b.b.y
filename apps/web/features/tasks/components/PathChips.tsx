import { Icon, Pressable, Stack, Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";

export interface PathChipsProps {
  paths: string[];
  /** When provided, each chip becomes a remove control. */
  onRemove?: (path: string) => void;
}

/**
 * Renders detected file/folder paths as mono accent tokens. Read-only by
 * default; pass `onRemove` to make each chip a removable context token (used in
 * the composer, where the user prunes what gets attached).
 */
export function PathChips({ paths, onRemove }: PathChipsProps) {
  const t = useTranslations("tasks");
  if (paths.length === 0) return null;

  return (
    <Stack wrap direction="row" gap="75">
      {paths.map((path) =>
        onRemove ? (
          <Pressable
            aria-label={t("composer.removePathAria", { path })}
            key={path}
            onClick={() => onRemove(path)}
          >
            <Tag size="sm" tone="accent">
              <Icon name="file" size="xs" />
              {path}
              <Icon name="x" size="xs" />
            </Tag>
          </Pressable>
        ) : (
          <Tag key={path} size="sm" tone="accent">
            <Icon name="file" size="xs" />
            {path}
          </Tag>
        ),
      )}
    </Stack>
  );
}
