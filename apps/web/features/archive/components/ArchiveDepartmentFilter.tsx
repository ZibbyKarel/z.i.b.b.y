"use client";

import { useEffect, useRef, useState } from "react";
import { DEPARTMENTS } from "@zibby/contracts";
import {
  Card,
  Checkbox,
  Container,
  Icon,
  ListItem,
  MenuSurface,
  Stack,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type ArchiveDepartmentFilterId, NO_DEPARTMENT } from "../archiveGroups";

export enum ArchiveDepartmentFilterTestId {
  Root = "archive-department-filter-root",
  Trigger = "archive-department-filter-trigger",
  Panel = "archive-department-filter-panel",
  AllOption = "archive-department-filter-all-option",
  Option = "archive-department-filter-option",
}

export interface ArchiveDepartmentFilterProps {
  /** Currently selected filter ids — empty means "all departments" (no filter). */
  selected: readonly ArchiveDepartmentFilterId[];
  onChange: (next: ArchiveDepartmentFilterId[]) => void;
  /** Per-id counts from `computeDepartmentCounts` — absent id reads as 0. */
  counts: Partial<Record<ArchiveDepartmentFilterId, number>>;
  /** Total archived + search-matched rows, for the "all departments" option's count. */
  total: number;
}

/**
 * The `/archiv` page's department filter (F2, `docs/plans/hud2chat-F2-archive.md`,
 * decision D3) — a multi-select with per-option coloured dots and live counts.
 *
 * Built as a DOMAIN COMPOSITE here, not a DS `Dropdown` extension: DS's existing
 * `Dropdown` multi-select (`libs/design-system/src/components/Dropdown/Dropdown.tsx`)
 * already covers "pick many options with checkboxes", but its `DropdownOption`
 * shape has no per-option colour-dot slot and no trailing-count slot — both of
 * which need the `DEPARTMENTS` registry's domain-shaped data (hex colours, live
 * run counts) that a generic DS primitive shouldn't carry for one call site. This
 * mirrors the SKILL.md rule ("decide explicitly: DS, or a domain composite") the
 * same way `PipelineOwnerChip`/`DepartmentDrawer` already do for per-department
 * colour.
 *
 * Every DS piece here IS reused, though: `Card as="button"` for the trigger (bakes
 * in full-width button styling + a `style` passthrough), `MenuSurface` for the
 * floating panel, and `ListItem` + `role="option"`/`aria-selected` +
 * `Checkbox presentational` for each row — the exact pattern DS's own `Dropdown`
 * uses internally for ITS multi-select rows. `ListItem`'s own `active` prop is
 * deliberately NOT used here: it sets `aria-current="page"`, which is the wrong
 * semantic for a checkbox-shaped option (`aria-selected` is correct instead).
 */
export function ArchiveDepartmentFilter({
  selected,
  onChange,
  counts,
  total,
}: ArchiveDepartmentFilterProps) {
  const t = useTranslations("archive.filter");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function toggle(id: ArchiveDepartmentFilterId) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  const label =
    selected.length === 0
      ? t("all")
      : selected.length === 1
        ? departmentLabel(selected[0]!, t)
        : t("multiple", { n: selected.length });

  // A small colour-dot preview on the trigger — only when every selected id is a
  // real department (the "bez oddělení" pseudo id has no colour of its own).
  const dotColors =
    selected.length > 0 && selected.length <= 3
      ? selected
          .map((id) => DEPARTMENTS.find((s) => s.id === id)?.color)
          .filter((c): c is string => Boolean(c))
      : [];
  const showDots = dotColors.length === selected.length && dotColors.length > 0;

  return (
    <Container data-testid={ArchiveDepartmentFilterTestId.Root} position="relative" ref={rootRef}>
      <Card
        aria-expanded={open}
        aria-haspopup="listbox"
        as="button"
        data-testid={ArchiveDepartmentFilterTestId.Trigger}
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex" }}
      >
        <Container padding="150">
          <Stack align="center" direction="row" gap="100">
            <Icon name="grid" size="sm" tone="faint" />
            {showDots && (
              <Stack direction="row" gap="25">
                {dotColors.map((color, i) => (
                  <Container
                    height="7px"
                    key={`${color}-${i}`}
                    style={{ borderRadius: "50%", background: color }}
                    width="7px"
                  />
                ))}
              </Stack>
            )}
            <Container grow>
              <Typography size="sm" type="note" variant={selected.length ? "primary" : "secondary"}>
                {label}
              </Typography>
            </Container>
            <Icon name="chevron" size="xs" tone="faint" />
          </Stack>
        </Container>
      </Card>

      {open && (
        <MenuSurface
          scroll
          align="stretch"
          data-testid={ArchiveDepartmentFilterTestId.Panel}
          role="listbox"
        >
          {/* `data-testid` sits on the inner `Stack`, not `ListItem` itself — `ListItem`
              hardcodes its own generic testid after spreading its rest props, so a
              `data-testid` passed to it would silently be discarded. `role="option"`/
              `aria-selected` DO survive on `ListItem` (they're never re-set after the
              spread), which is what actually needs to be on the interactive button. */}
          <ListItem
            aria-selected={selected.length === 0}
            onSelect={() => onChange([])}
            role="option"
          >
            <Stack
              align="center"
              data-testid={ArchiveDepartmentFilterTestId.AllOption}
              direction="row"
              gap="100"
            >
              <Checkbox presentational checked={selected.length === 0} size="sm" />
              <Container grow>
                <Typography size="sm" type="note">
                  {t("all")}
                </Typography>
              </Container>
              <Typography mono size="xs" type="note" variant="tertiary">
                {total}
              </Typography>
            </Stack>
          </ListItem>

          {DEPARTMENTS.map((s) => (
            <ListItem
              aria-selected={selected.includes(s.id)}
              key={s.id}
              onSelect={() => toggle(s.id)}
              role="option"
            >
              <Stack
                align="center"
                data-department-id={s.id}
                data-testid={ArchiveDepartmentFilterTestId.Option}
                direction="row"
                gap="100"
              >
                <Checkbox presentational checked={selected.includes(s.id)} size="sm" />
                <Container
                  height="6px"
                  style={{ borderRadius: "50%", background: s.color }}
                  width="6px"
                />
                <Container grow>
                  <Typography size="sm" type="note">
                    {s.name}
                  </Typography>
                </Container>
                <Typography mono size="xs" type="note" variant="tertiary">
                  {counts[s.id] ?? 0}
                </Typography>
              </Stack>
            </ListItem>
          ))}

          <ListItem
            aria-selected={selected.includes(NO_DEPARTMENT)}
            onSelect={() => toggle(NO_DEPARTMENT)}
            role="option"
          >
            <Stack
              align="center"
              data-department-id={NO_DEPARTMENT}
              data-testid={ArchiveDepartmentFilterTestId.Option}
              direction="row"
              gap="100"
            >
              <Checkbox presentational checked={selected.includes(NO_DEPARTMENT)} size="sm" />
              <Container grow>
                <Typography size="sm" type="note" variant="tertiary">
                  {t("noDepartment")}
                </Typography>
              </Container>
              <Typography mono size="xs" type="note" variant="tertiary">
                {counts[NO_DEPARTMENT] ?? 0}
              </Typography>
            </Stack>
          </ListItem>
        </MenuSurface>
      )}
    </Container>
  );
}

function departmentLabel(
  id: ArchiveDepartmentFilterId,
  t: ReturnType<typeof useTranslations<"archive.filter">>,
): string {
  if (id === NO_DEPARTMENT) return t("noDepartment");
  return DEPARTMENTS.find((s) => s.id === id)?.name ?? id;
}
