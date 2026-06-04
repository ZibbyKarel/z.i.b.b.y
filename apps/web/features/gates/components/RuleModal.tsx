"use client";
import { useTranslations } from "next-intl";
import type { Decision, GateRuleInput, MatchCondition, Resolve } from "@zibby/contracts";
import { Button, Dialog, Stack } from "@zibby/design-system";
import { FormSelect, FormTextInput, useFormControls } from "@zibby/forms";
import { MATCH_TYPE_ORDER, type MatchType } from "../gate";

export interface RuleModalProps {
  onClose: () => void;
  onSave: (rule: GateRuleInput) => void;
}

const DECISIONS: Decision[] = ["allow", "notify", "ask", "deny"];
const OPS = ["gt", "gte", "lt", "lte", "eq"] as const;
const OP_SYMBOL: Record<(typeof OPS)[number], string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
type ResolveKind = "human" | "check" | "agent";

type RuleFormValues = {
  matchType: MatchType;
  value1: string;
  value2: string;
  op: (typeof OPS)[number];
  decision: Decision;
  resolveKind: ResolveKind;
  resolveName: string;
};

function buildMatch(v: RuleFormValues): MatchCondition | null {
  const val = v.value1.trim();
  switch (v.matchType) {
    case "tool":
      return val ? { type: "tool", tool: val } : null;
    case "action":
      return val ? { type: "action", action: val, ...(v.value2.trim() ? { branch: v.value2.trim() } : {}) } : null;
    case "threshold":
      return val && v.value2.trim() !== "" ? { type: "threshold", metric: val, op: v.op, value: Number(v.value2) } : null;
    case "scope":
      return val ? { type: "scope", scope: val } : null;
    case "context":
      return val ? { type: "context", context: val } : null;
  }
}

function buildResolve(v: RuleFormValues): Resolve | undefined {
  if (v.decision !== "ask") return undefined;
  if (v.resolveKind === "human") return { type: "human" };
  if (v.resolveKind === "check") return { type: "check", check: v.resolveName.trim() || "ci_green" };
  return { type: "agent", agent: v.resolveName.trim() || "reviewer" };
}

export function RuleModal({ onClose, onSave }: RuleModalProps) {
  const t = useTranslations("gates");

  const { renderForm, submit, form } = useFormControls<RuleFormValues>({
    defaultValues: {
      matchType: "action",
      value1: "",
      value2: "",
      op: "gt",
      decision: "ask",
      resolveKind: "human",
      resolveName: "",
    },
    onSubmit: (values) => {
      const match = buildMatch(values);
      if (!match) return;
      onSave({ match: [match], decision: values.decision, resolve: buildResolve(values) });
    },
  });

  const values = form.watch();
  const canSave =
    buildMatch(values) !== null &&
    (values.decision !== "ask" || values.resolveKind === "human" || values.resolveName.trim() !== "");

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!canSave} icon="check" intent="run" onClick={() => void submit()}>
            {t("saveRule")}
          </Button>
        </>
      }
      onClose={onClose}
      title={t("newRule")}
      width="md"
    >
      <Stack gap="200">
        <FormSelect<MatchType, RuleFormValues>
          label={t("matchType")}
          name="matchType"
          options={MATCH_TYPE_ORDER.map((m) => ({ value: m, label: t(`matcher.${m}`) }))}
        />

        {values.matchType === "threshold" ? (
          <Stack direction="row" gap="100">
            <FormTextInput<RuleFormValues>
              label={t("metric")}
              name="value1"
              placeholder="purchase.amount"
            />
            <FormSelect<(typeof OPS)[number], RuleFormValues>
              label={t("op")}
              name="op"
              options={OPS.map((o) => ({ value: o, label: OP_SYMBOL[o] }))}
            />
            <FormTextInput<RuleFormValues>
              label={t("value")}
              name="value2"
              placeholder="500"
              type="number"
            />
          </Stack>
        ) : (
          <Stack direction="row" gap="100">
            <FormTextInput<RuleFormValues>
              label={t(`matchValue.${values.matchType}`)}
              name="value1"
              placeholder={t(`matchPlaceholder.${values.matchType}`)}
            />
            {values.matchType === "action" && (
              <FormTextInput<RuleFormValues>
                label={t("branch")}
                name="value2"
                placeholder="main"
              />
            )}
          </Stack>
        )}

        <FormSelect<Decision, RuleFormValues>
          hint={t(`decisionHint.${values.decision}`)}
          label={t("decision")}
          name="decision"
          options={DECISIONS.map((d) => ({ value: d, label: t(`decision_.${d}`) }))}
        />

        {values.decision === "ask" && (
          <Stack direction="row" gap="100">
            <FormSelect<ResolveKind, RuleFormValues>
              label={t("resolveBy")}
              name="resolveKind"
              options={(["human", "check", "agent"] as ResolveKind[]).map((k) => ({
                value: k,
                label: t(`resolve.${k}`),
              }))}
            />
            {values.resolveKind !== "human" && (
              <FormTextInput<RuleFormValues>
                label={values.resolveKind === "agent" ? t("resolveAgent") : t("resolveCheck")}
                name="resolveName"
                placeholder={values.resolveKind === "agent" ? "reviewer" : "ci_green"}
              />
            )}
          </Stack>
        )}
      </Stack>
    </Dialog>,
  );
}
