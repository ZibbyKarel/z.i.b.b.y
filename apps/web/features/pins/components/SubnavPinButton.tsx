"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@zibby/design-system";
import { useCompanyQuery } from "../../companies";
import { useProjectQuery } from "../../projects";
import { useTeamQuery } from "../../teams";
import { usePagePins } from "../usePagePins";
import { PinPageDialog } from "./PinPageDialog";

export enum SubnavPinButtonTestId {
  Button = "subnav-pin-button",
}

/** `/work/<kind>/<id>` detail pages this button appears on (spec step 5) —
 *  `companies`/`projects`/`teams`, never their `/new` creation screen. */
export type SubnavPinEntityKind = "companies" | "projects" | "teams";

export interface SubnavPinButtonProps {
  kind: SubnavPinEntityKind;
  id: string;
  /** This entity's base detail href (`/work/<kind>/<id>`) — the pin target,
   *  even when the current page is one of its sub-tabs. */
  href: string;
}

/** Resolves the entity's display name for the dialog's default — falls back
 *  to the id while the query is pending/absent (the dialog still lets the
 *  operator type their own name either way). */
function useEntityName(kind: SubnavPinEntityKind, id: string): string | undefined {
  const companyQ = useCompanyQuery(id, { enabled: kind === "companies" });
  const projectQ = useProjectQuery(id, { enabled: kind === "projects" });
  const teamQ = useTeamQuery(id, { enabled: kind === "teams" });
  if (kind === "companies") return companyQ.data?.name;
  if (kind === "projects") return projectQ.data?.name;
  return teamQ.data?.name;
}

/**
 * The subnav `+ PIN` / `PINNED` toggle (design line 100, spec step 5) on a
 * company/project/team detail page — pins the entity's base href as a page
 * pin (spec decision 1: every pin is a URL + operator-given name, including
 * these catalog entities) rather than the mock's original entity-kind pin,
 * so it shows up in the same sidebar list as any other pinned page. Unpinning
 * is immediate; pinning opens `PinPageDialog` to confirm the name.
 */
export function SubnavPinButton({ kind, id, href }: SubnavPinButtonProps) {
  const t = useTranslations("pins");
  const { isPagePinned, unpinPage } = usePagePins();
  const entityName = useEntityName(kind, id);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pinned = isPagePinned(href);

  return (
    <>
      <Button
        data-testid={SubnavPinButtonTestId.Button}
        icon={pinned ? undefined : "plus"}
        intent={pinned ? "primary" : "secondary"}
        onClick={() => (pinned ? unpinPage(href) : setDialogOpen(true))}
        size="sm"
      >
        {t(pinned ? "pinnedLabel" : "pin")}
      </Button>
      {dialogOpen && (
        <PinPageDialog
          defaultName={entityName ?? id}
          href={href}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </>
  );
}
