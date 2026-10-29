"use client";

import type { QuickAction, QuickActionTarget } from "@zibby/contracts";
import {
  Button,
  Checkbox,
  Container,
  Dropdown,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { type FormEvent, useMemo, useState } from "react";
import { CommandLine } from "../../tasks/components/CommandLine/CommandLine";

export enum QuickActionFormTestId {
  Label = "quick-actions-label",
  Text = "quick-actions-text",
  Target = "quick-actions-target",
  Immediate = "quick-actions-immediate",
  Submit = "quick-actions-add",
  Form = "quick-actions-form",
  Cancel = "quick-actions-cancel",
}

export type NamedEntity = { id: string; name?: string | undefined };

export const MAX_TEXT = 8000;

export interface QuickActionFormValues {
  label: string;
  text: string;
  target?: QuickActionTarget;
  /** Present only when checked. */
  immediate?: true;
}

interface QuickActionFormProps {
  agents: NamedEntity[];
  workflows: NamedEntity[];
  /** Pre-fills the form (edit); absent = a blank add form. */
  initial?: QuickAction;
  submitLabel: string;
  disabled?: boolean;
  pending: boolean;
  onSubmit: (values: QuickActionFormValues, done: () => void) => void;
  onCancel?: () => void;
}

const targetValue = (t: QuickActionTarget | undefined) => (t ? `${t.kind}:${t.id}` : "");

/** Label + task text + target picker, shared by the widget's add form and the sheet's edit mode. */
export function QuickActionForm({
  agents,
  workflows,
  initial,
  submitLabel,
  disabled = false,
  pending,
  onSubmit,
  onCancel,
}: QuickActionFormProps) {
  const t = useTranslations("bridge.widgets.quickActions");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [text, setText] = useState(initial?.text ?? "");
  // Bumped after a successful submit to remount (and so clear) the CommandLine.
  const [textKey, setTextKey] = useState(0);
  const [choice, setChoice] = useState(targetValue(initial?.target));
  const [immediate, setImmediate] = useState(initial?.immediate === true);

  const { options, targets } = useMemo(() => {
    const targets = new Map<string, QuickActionTarget>();
    const opts = [{ value: "", label: t("auto") }];
    for (const a of agents) {
      const name = a.name ?? a.id;
      targets.set(`agent:${a.id}`, { kind: "agent", id: a.id, name });
      opts.push({ value: `agent:${a.id}`, label: name });
    }
    for (const w of workflows) {
      const name = w.name ?? w.id;
      targets.set(`workflow:${w.id}`, { kind: "workflow", id: w.id, name });
      opts.push({ value: `workflow:${w.id}`, label: name });
    }
    return { options: opts, targets };
  }, [agents, workflows, t]);

  const blank = !label.trim() || !text.trim() || text.length > MAX_TEXT || disabled;

  /** `body` overrides the mirrored `text` when Enter in the CommandLine submits. */
  const submit = (body: string) => {
    if (!label.trim() || !body.trim() || body.length > MAX_TEXT || disabled || pending) return;
    // An edited action keeps its stored target when that entity is gone from the catalog.
    const target =
      targets.get(choice) ??
      (choice === targetValue(initial?.target) ? initial?.target : undefined);
    onSubmit(
      {
        label: label.trim(),
        text: body.trim(),
        ...(target ? { target } : {}),
        ...(immediate ? { immediate: true as const } : {}),
      },
      () => {
        if (initial) return;
        setLabel("");
        setText("");
        setTextKey((k) => k + 1);
        setChoice("");
        setImmediate(false);
      },
    );
  };
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(text);
  };

  return (
    <Container
      as="form"
      data-testid={QuickActionFormTestId.Form}
      onSubmit={handleSubmit}
      padding={["100", "150"]}
    >
      <Stack gap="100">
        <TextInputField
          hideLabel
          data-testid={QuickActionFormTestId.Label}
          label={t("label")}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("labelPlaceholder")}
          value={label}
        />
        <Container data-testid={QuickActionFormTestId.Text}>
          <CommandLine
            allowSkillMentions
            chrome={false}
            initialText={initial?.text}
            key={textKey}
            label={t("text")}
            onSubmit={submit}
            onTextChange={setText}
            placeholder={t("textPlaceholder")}
            renderTrailing={() => null}
            resetOnSubmit={false}
            showAttach={false}
          />
        </Container>
        <Stack align="center" direction="row" gap="100">
          <Stack data-testid={QuickActionFormTestId.Target}>
            <Dropdown
              aria-label={t("target")}
              onChange={setChoice}
              options={options}
              value={choice}
            />
          </Stack>
          <Checkbox
            checked={immediate}
            data-testid={QuickActionFormTestId.Immediate}
            label={t("immediate")}
            onChange={setImmediate}
          />
          <Typography type="note" variant="secondary">
            {t("immediate")}
          </Typography>
          <Button
            data-testid={QuickActionFormTestId.Submit}
            disabled={blank || pending}
            intent="secondary"
            loading={pending}
            type="submit"
          >
            {submitLabel}
          </Button>
          {onCancel ? (
            <Button
              data-testid={QuickActionFormTestId.Cancel}
              intent="ghost"
              onClick={onCancel}
              type="button"
            >
              {t("cancel")}
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Container>
  );
}
