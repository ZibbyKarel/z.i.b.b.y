"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Decision, GlobalGateRule, GlobalGateRuleInput, MatchCondition, Resolve } from "@zibby/contracts";
import { Button, Dialog, Divider, SegmentPicker, Select, Stack, TextInput, Typography } from "@zibby/design-system";
import { FormSelect, FormTextInput, useFormControls } from "@zibby/forms";
import { MATCH_TYPE_ORDER, type MatchType, flattenResolve } from "../gate";

export interface RuleModalProps {
  /** The rule being edited, or undefined to create a fresh one. */
  initial?: GlobalGateRule;
  onClose: () => void;
  onSave: (rule: GlobalGateRuleInput) => void;
  /** True while the save mutation is in flight. */
  pending?: boolean;
}

const DECISIONS: Decision[] = ["allow", "notify", "ask", "deny"];
const OPS = ["gt", "gte", "lt", "lte", "eq"] as const;
const OP_SYMBOL: Record<(typeof OPS)[number], string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
type ResolveKind = "human" | "check" | "agent";
type ResolveLeafDraft = { kind: ResolveKind; name: string };

type RuleFormValues = {
  name: string;
  desc: string;
  matchType: MatchType;
  value1: string;
  value2: string;
  op: (typeof OPS)[number];
  decision: Decision;
};

/** Derive the form's match fields from a stored rule's first match condition. */
function matchToFields(c: MatchCondition | undefined): Pick<RuleFormValues, "matchType" | "value1" | "value2" | "op"> {
  switch (c?.type) {
    case "tool":
      return { matchType: "tool", value1: c.tool, value2: "", op: "gt" };
    case "action":
      return { matchType: "action", value1: c.action, value2: c.branch ?? "", op: "gt" };
    case "threshold":
      return { matchType: "threshold", value1: c.metric, value2: String(c.value), op: c.op };
    case "scope":
      return { matchType: "scope", value1: c.scope, value2: "", op: "gt" };
    case "context":
      return { matchType: "context", value1: c.context, value2: "", op: "gt" };
    default:
      return { matchType: "action", value1: "", value2: "", op: "gt" };
  }
}

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

/** Turn one resolve leaf draft into its `Resolve` node. */
function leafNode(leaf: ResolveLeafDraft): Resolve {
  if (leaf.kind === "check") return { type: "check", check: leaf.name.trim() || "ci_green" };
  if (leaf.kind === "agent") return { type: "agent", agent: leaf.name.trim() || "reviewer" };
  return { type: "human" };
}

/** Combine the leaf drafts into a single `Resolve` (a tree only when there are 2+). */
function buildResolve(decision: Decision, leaves: ResolveLeafDraft[], mode: "all" | "any"): Resolve | undefined {
  if (decision !== "ask" || leaves.length === 0) return undefined;
  if (leaves.length === 1) return leafNode(leaves[0]!);
  const nodes = leaves.map(leafNode);
  return mode === "all" ? { type: "all", all: nodes } : { type: "any", any: nodes };
}

/**
 * Add / edit a global catalog rule (the "Pravidla schvalování" page): name + desc,
 * one match condition (matcher → pattern), a decision, and — only for `ask` — a
 * resolution made of human/check/agent leaves combined by AND/OR. Editing prefills
 * from the stored rule; any trailing match conditions are preserved on save.
 */
export function RuleModal({ initial, onClose, onSave, pending = false }: RuleModalProps) {
  const t = useTranslations("gates");
  const seeded = flattenResolve(initial?.resolve);

  const [leaves, setLeaves] = useState<ResolveLeafDraft[]>(
    seeded.leaves.length > 0
      ? seeded.leaves.map((l) => ({ kind: l.kind, name: l.name ?? "" }))
      : [{ kind: "human", name: "" }],
  );
  const [mode, setMode] = useState<"all" | "any">(seeded.mode);

  const { renderForm, submit, form } = useFormControls<RuleFormValues>({
    defaultValues: {
      name: initial?.name ?? "",
      desc: initial?.desc ?? "",
      decision: initial?.decision ?? "ask",
      ...matchToFields(initial?.match[0]),
    },
    onSubmit: (values) => {
      const first = buildMatch(values);
      if (!first) return;
      const match: MatchCondition[] = initial ? [first, ...initial.match.slice(1)] : [first];
      onSave({
        ...(values.name.trim() ? { name: values.name.trim() } : {}),
        ...(values.desc.trim() ? { desc: values.desc.trim() } : {}),
        match,
        decision: values.decision,
        resolve: buildResolve(values.decision, leaves, mode),
      });
    },
  });

  const values = form.watch();
  const leavesValid = leaves.every((l) => l.kind === "human" || l.name.trim() !== "");
  const canSave =
    buildMatch(values) !== null && (values.decision !== "ask" || (leaves.length > 0 && leavesValid));

  const setLeaf = (i: number, patch: Partial<ResolveLeafDraft>) =>
    setLeaves((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLeaf = () => setLeaves((prev) => [...prev, { kind: "human", name: "" }]);
  const removeLeaf = (i: number) => setLeaves((prev) => prev.filter((_, j) => j !== i));

  return renderForm(
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!canSave || pending} icon="check" intent="run" onClick={() => void submit()}>
            {t("saveRule")}
          </Button>
        </>
      }
      onClose={onClose}
      title={initial ? t("editRule") : t("newRule")}
      width="md"
    >
      <Stack gap="200">
        <FormTextInput<RuleFormValues> label={t("ruleName")} name="name" placeholder={t("ruleNamePlaceholder")} />

        <FormSelect<MatchType, RuleFormValues>
          label={t("matchType")}
          name="matchType"
          options={MATCH_TYPE_ORDER.map((m) => ({ value: m, label: t(`matcher.${m}`) }))}
        />

        {values.matchType === "threshold" ? (
          <Stack direction="row" gap="100">
            <FormTextInput<RuleFormValues> label={t("metric")} name="value1" placeholder="purchase.amount" />
            <FormSelect<(typeof OPS)[number], RuleFormValues>
              label={t("op")}
              name="op"
              options={OPS.map((o) => ({ value: o, label: OP_SYMBOL[o] }))}
            />
            <FormTextInput<RuleFormValues> label={t("value")} name="value2" placeholder="500" type="number" />
          </Stack>
        ) : (
          <Stack direction="row" gap="100">
            <FormTextInput<RuleFormValues>
              label={t(`matchValue.${values.matchType}`)}
              name="value1"
              placeholder={t(`matchPlaceholder.${values.matchType}`)}
            />
            {values.matchType === "action" && (
              <FormTextInput<RuleFormValues> label={t("branch")} name="value2" placeholder="main" />
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
          <Stack gap="150">
            <Typography mono size="2xs" type="note" variant="tertiary" weight="bold">
              {t("resolutionTitle")}
            </Typography>
            {leaves.length > 1 && (
              <SegmentPicker
                label={t("resolveMode")}
                onValueChange={(v) => setMode(v as "all" | "any")}
                options={[
                  { value: "all", label: t("resolveModeAll") },
                  { value: "any", label: t("resolveModeAny") },
                ]}
                value={mode}
              />
            )}
            {leaves.map((leaf, i) => (
              <Stack align="end" direction="row" gap="100" key={i}>
                <Select<ResolveKind>
                  label={t("resolveBy")}
                  onValueChange={(v) => setLeaf(i, { kind: v })}
                  options={(["human", "check", "agent"] as ResolveKind[]).map((k) => ({
                    value: k,
                    label: t(`resolve.${k}`),
                  }))}
                  value={leaf.kind}
                />
                {leaf.kind !== "human" && (
                  <TextInput
                    label={leaf.kind === "agent" ? t("resolveAgent") : t("resolveCheck")}
                    onChange={(e) => setLeaf(i, { name: e.target.value })}
                    placeholder={leaf.kind === "agent" ? "reviewer" : "ci_green"}
                    value={leaf.name}
                  />
                )}
                {leaves.length > 1 && (
                  <Button
                    aria-label={t("removeCondition")}
                    icon="x"
                    intent="ghost"
                    onClick={() => removeLeaf(i)}
                    size="sm"
                  />
                )}
              </Stack>
            ))}
            <Divider />
            <Button icon="plus" intent="ghost" onClick={addLeaf} size="sm">
              {t("addCondition")}
            </Button>
          </Stack>
        )}
      </Stack>
    </Dialog>,
  );
}
