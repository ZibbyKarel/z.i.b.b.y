import { Icon, Pressable, Stack, Tag } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import type { ResolvedPath } from "../task";

export interface PathChipsProps {
  paths: string[];
  /**
   * Phase 11: backend-resolved attribution for the detected paths (from the classify
   * verdict). A path inside a registered project shows "scoped to <name>"; one
   * outside offers a gated "grant access" action. Absent/not-yet-resolved → a plain
   * chip (resolution arrives after the debounced classify).
   */
  resolved?: ResolvedPath[];
  /** When provided, each chip becomes a remove control. */
  onRemove?: (path: string) => void;
  /** When provided, an out-of-project chip offers a "grant access" action. */
  onGrant?: (path: string) => void;
}

/**
 * Renders detected file/folder paths as mono tokens (Phase 11.3): a path scoped to
 * a registered project reads "scoped to <name>"; an out-of-project path carries a
 * gated "grant access" action that registers the folder as a workspace root. Each
 * chip stays removable. Resolution is backend-only (Law 4) — these chips render
 * whatever `resolved` attribution the classify verdict carried, never their own.
 */
export function PathChips({ paths, resolved, onRemove, onGrant }: PathChipsProps) {
  const t = useTranslations("tasks");
  if (paths.length === 0) return null;

  const byPath = new Map((resolved ?? []).map((r) => [r.path, r]));

  return (
    <Stack wrap direction="row" gap="75">
      {paths.map((path) => {
        const entry = byPath.get(path);
        const scoped = entry?.project ?? null;
        const isResolved = entry !== undefined;
        const label = scoped
          ? `${path} · ${t("paths.scopedTo", { project: scoped.name })}`
          : path;
        return (
          <Stack align="center" direction="row" gap="50" key={path}>
            <Tag size="sm" tone={scoped ? "ok" : "accent"}>
              <Icon name={scoped ? "check" : "file"} size="xs" />
              {label}
            </Tag>
            {isResolved && !scoped && onGrant && (
              <Pressable
                aria-label={t("paths.grantAria", { path })}
                onClick={() => onGrant(path)}
              >
                <Tag size="sm" tone="warn">
                  <Icon name="shield" size="xs" />
                  {t("paths.grant")}
                </Tag>
              </Pressable>
            )}
            {onRemove && (
              <Pressable
                aria-label={t("composer.removePathAria", { path })}
                onClick={() => onRemove(path)}
              >
                <Icon name="x" size="xs" />
              </Pressable>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
