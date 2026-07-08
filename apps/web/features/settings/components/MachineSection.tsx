"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stack, TextInputField, Typography } from "@zibby/design-system";
import type { MachineConfig } from "@zibby/contracts";
import { HudPanel } from "../../../components/HudPanel/HudPanel";
import { useMachineConfigQuery, useUpdateMachineConfigMutation } from "../../machine";

/** Testids for the per-machine config editor (the screen + tests select via these). */
export enum MachineSectionTestId {
  CloneRoot = "machine-clone-root",
  Save = "machine-save",
}

/**
 * THIS machine's per-machine config (Phase 76/77) — currently just `cloneRoot`,
 * the local directory ZIBBY clones a project into when it isn't already present
 * at its canonical `path` on this machine. Deliberately per-machine and never
 * synced (gitignored on disk) — unlike `SystemSection`'s operator-owned runtime
 * knobs, this editor only ever talks to THIS machine's `/api/machine/config`.
 */
export function MachineSection() {
  const { data: config } = useMachineConfigQuery();
  if (!config) return null;
  // Remount the editor when the persisted config changes so local state reseeds.
  return <MachineEditor config={config} key={config.cloneRoot} />;
}

function MachineEditor({ config }: { config: MachineConfig }) {
  const t = useTranslations("settings");
  const setConfig = useUpdateMachineConfigMutation();
  const [cloneRoot, setCloneRoot] = useState(config.cloneRoot);

  const trimmed = cloneRoot.trim();
  const save = () => {
    if (trimmed) setConfig.mutate({ body: { cloneRoot: trimmed } });
  };

  return (
    <HudPanel padding="300" title={t("machine.title")}>
      <Stack gap="200">
        <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
          {t("machine.cloneRootHint")}
        </Typography>

        <TextInputField
          data-testid={MachineSectionTestId.CloneRoot}
          label={t("machine.cloneRootLabel")}
          onChange={(e) => setCloneRoot(e.target.value)}
          placeholder={config.cloneRoot}
          value={cloneRoot}
        />

        <Stack align="center" direction="row" justify="end">
          <Button
            data-testid={MachineSectionTestId.Save}
            disabled={setConfig.isPending || trimmed.length === 0}
            icon="check"
            intent="primary"
            onClick={save}
          >
            {t("machine.save")}
          </Button>
        </Stack>
      </Stack>
    </HudPanel>
  );
}
