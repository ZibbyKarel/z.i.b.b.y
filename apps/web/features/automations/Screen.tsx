"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Container,
  Dialog,
  SegmentPickerField,
  Stack,
  StatusDot,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import type { Automation, Target } from "@zibby/contracts";
import { PageContainer } from "../../components/PageContainer/PageContainer";
import { SectionToolbar } from "../../components/SectionToolbar/SectionToolbar";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { slug } from "../../utils/slug";
import { useAutomationsQuery } from "./queries";
import {
  useCreateAutomationMutation,
  useTriggerAutomationMutation,
  useUpdateAutomationMutation,
} from "./mutations";

type TargetType = Target["type"];

export function Screen() {
  const { data: automations = [] } = useAutomationsQuery();
  const create = useCreateAutomationMutation();
  const update = useUpdateAutomationMutation();
  const trigger = useTriggerAutomationMutation();
  const [adding, setAdding] = useState(false);

  return (
    <PageContainer>
      <SectionToolbar addLabel="Add automation" label="Automations" onAdd={() => setAdding(true)} />

      {automations.length === 0 ? (
        <EmptyState
          actionLabel="Add automation"
          description="Cron and event triggers run pipelines and agents unprompted — overnight work, morning briefings. Every external-effect action still passes the approval gate."
          glyph="clock"
          onAction={() => setAdding(true)}
          title="No automations yet"
        />
      ) : (
        <Stack gap="150">
          {automations.map((a) => (
            <AutomationRow
              automation={a}
              key={a.id}
              onToggle={() =>
                update.mutate({ params: { id: a.id }, body: { enabled: !a.enabled } })
              }
              onTrigger={() => trigger.mutate({ params: { id: a.id }, body: {} })}
            />
          ))}
        </Stack>
      )}

      {adding && (
        <CreateDialog
          onClose={() => setAdding(false)}
          onCreate={(body) => create.mutate({ body }, { onSuccess: () => setAdding(false) })}
        />
      )}
    </PageContainer>
  );
}

function AutomationRow({
  automation,
  onToggle,
  onTrigger,
}: {
  automation: Automation;
  onToggle: () => void;
  onTrigger: () => void;
}) {
  const triggerText =
    automation.trigger.type === "cron" ? `cron · ${automation.trigger.expr}` : `event · ${automation.trigger.event}`;
  const targetText =
    automation.target.type === "pipeline"
      ? `pipeline:${automation.target.pipelineId}`
      : `agent:${automation.target.agentId}`;

  return (
    <Card background="background" radius="default">
      <Container padding={["150", "200"]}>
        <Stack align="center" direction="row" gap="200" justify="between">
          <Stack align="center" direction="row" gap="150">
            <StatusDot tone={automation.enabled ? "ok" : "wait"} />
            <Container minW0>
              <Typography size="base" type="note" weight="semibold">
                {automation.name ?? automation.id}
              </Typography>
              <Typography mono size="sm" type="note" variant="tertiary">
                {triggerText} → {targetText}
              </Typography>
            </Container>
          </Stack>
          <Stack align="center" direction="row" gap="100">
            <Button icon="play" intent="ghost" onClick={onTrigger} size="sm">
              Run now
            </Button>
            <Button intent="ghost" onClick={onToggle} size="sm">
              {automation.enabled ? "Disable" : "Enable"}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Card>
  );
}

function CreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (body: Omit<Automation, "lastFiredAt">) => void;
}) {
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("0 7 * * *");
  const [targetType, setTargetType] = useState<TargetType>("pipeline");
  const [targetId, setTargetId] = useState("");

  const target: Target =
    targetType === "pipeline"
      ? { type: "pipeline", pipelineId: targetId }
      : { type: "agent", agentId: targetId };

  const submit = () =>
    onCreate({
      id: slug(name, "novy"),
      name: name.trim() || slug(name, "novy"),
      trigger: { type: "cron", expr },
      target,
      enabled: true,
    });

  return (
    <Dialog
      open
      actions={
        <Stack grow align="center" direction="row" justify="end">
          <Button intent="primary" onClick={submit}>
            Create
          </Button>
        </Stack>
      }
      ariaLabel="Create automation"
      closeLabel="Close"
      onClose={onClose}
      title="New automation"
      width="md"
    >
      <Stack gap="200">
        <TextInputField label="Name" onChange={(e) => setName(e.target.value)} value={name} />
        <TextInputField
          label="Cron (Europe/Prague)"
          onChange={(e) => setExpr(e.target.value)}
          value={expr}
        />
        <SegmentPickerField
          label="Target"
          onValueChange={(v) => setTargetType(v as TargetType)}
          options={[
            { value: "pipeline", label: "Pipeline" },
            { value: "agent", label: "Agent" },
          ]}
          value={targetType}
        />
        <TextInputField
          label="Target id"
          onChange={(e) => setTargetId(e.target.value)}
          value={targetId}
        />
      </Stack>
    </Dialog>
  );
}
