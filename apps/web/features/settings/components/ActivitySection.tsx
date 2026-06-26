"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ButtonGroup, Container, Divider, Stack, Typography } from "@zibby/design-system";
import {
  ACTIVITY_GROUPS,
  type ActivityGroup,
  type ActivityView,
  type ActivityViewMode,
} from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useActivityViewQuery } from "../queries";
import { useSetActivityViewMutation } from "../mutations";

/** The display modes offered per group, in order. Labels come from i18n. */
const MODES: ActivityViewMode[] = ["visible", "grouped", "hidden"];

/**
 * Settings → Activity: which activity groups the right-rail live log shows as
 * individual lines (`visible`), collapses into a counted row (`grouped`), or hides
 * entirely (`hidden`). Persisted on the file-backed activity-view doc and read live
 * by the rail. The whole document is PUT on every change (the mandate/chat posture).
 */
export function ActivitySection() {
  const { data: view } = useActivityViewQuery();
  if (!view) return null;
  return <ActivityEditor view={view} />;
}

function ActivityEditor({ view }: { view: ActivityView }) {
  const t = useTranslations("settings");
  const setView = useSetActivityViewMutation();
  const [local, setLocal] = useState<ActivityView>(view);

  const choose = (group: ActivityGroup, mode: ActivityViewMode) => {
    const next: ActivityView = { ...local, [group]: mode };
    setLocal(next);
    setView.mutate({ body: next });
  };

  return (
    <HudPanel padding="300" title={t("activity.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("activity.hint")}
        </Typography>

        {ACTIVITY_GROUPS.map((group, i) => (
          <Fragment key={group}>
            {i > 0 && <Divider />}
            <Stack align="center" direction="row" gap="250" justify="between">
              <Container minW0>
                <Typography type="text" weight="medium">
                  {t(`activity.groups.${group}`)}
                </Typography>
              </Container>
              <Container shrink={false}>
                <ButtonGroup
                  ariaLabel={t(`activity.groups.${group}`)}
                  onChange={(v) => choose(group, v as ActivityViewMode)}
                  options={MODES.map((m) => ({ id: m, label: t(`activity.modes.${m}`) }))}
                  value={local[group]}
                />
              </Container>
            </Stack>
          </Fragment>
        ))}
      </Stack>
    </HudPanel>
  );
}
