"use client";

import type { AutomationFire } from "@zibby/contracts";
import { CodeBlock, type SubNavLinkComponent, TextLink, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAutomationFireLogStream } from "../../runs/useRunLogStream";
import { AutomationFiresTestId } from "./AutomationFires";

export interface AutomationFireLogProps {
  fire: AutomationFire;
}

/**
 * One fire's log (todo-4/5). A run-backed fire (it carries `runRef`) links to its run,
 * which owns the real log; an in-process fire tails its own fire log live, in the same
 * DS `CodeBlock` the run log uses. Mount with `key={fire.id}`.
 */
export function AutomationFireLog({ fire }: AutomationFireLogProps) {
  const t = useTranslations("automations");
  const { text, done } = useAutomationFireLogStream(
    fire.automationId,
    fire.runRef ? null : fire.id,
  );
  if (fire.runRef) {
    return (
      <TextLink
        data-testid={AutomationFiresTestId.OpenRun}
        href={`/activity/runs/${encodeURIComponent(fire.runRef)}`}
        linkComponent={Link as SubNavLinkComponent}
      >
        <Typography size="sm" tone="accent" type="note">
          {t("fireOpenRun")}
        </Typography>
      </TextLink>
    );
  }
  return (
    <div data-testid={AutomationFiresTestId.Log}>
      <CodeBlock
        followTail
        caret={fire.status === "running" && !done}
        maxHeight="md"
        placeholder="…"
        scrollKey={text}
        text={text.replace(/\n$/, "")}
      />
    </div>
  );
}
