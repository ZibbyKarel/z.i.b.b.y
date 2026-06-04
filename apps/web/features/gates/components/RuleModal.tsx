import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Decision, GateRuleInput, MatchCondition, Resolve } from "@zibby/contracts";
import { Button, Dialog, Stack, TextInput } from "@zibby/design-system";
import { Select } from "@zibby/design-system";
import { MATCH_TYPE_ORDER, type MatchType } from "../gate";

export interface RuleModalProps {
  onClose: () => void;
  onSave: (rule: GateRuleInput) => void;
}

const DECISIONS: Decision[] = ["allow", "notify", "ask", "deny"];
const OPS = ["gt", "gte", "lt", "lte", "eq"] as const;
const OP_SYMBOL: Record<(typeof OPS)[number], string> = { gt: ">", gte: "≥", lt: "<", lte: "≤", eq: "=" };
type ResolveKind = "human" | "check" | "agent";

/**
 * Compose one editable gate rule (`match → decision → resolve`). Deliberately a
 * single match condition + a flat resolve — enough to author harden-only rules
 * against the contract; nested all/any trees are rendered but not edited here.
 */
export function RuleModal({ onClose, onSave }: RuleModalProps) {
  const t = useTranslations("gates");
  const [matchType, setMatchType] = useState<MatchType>("action");
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [op, setOp] = useState<(typeof OPS)[number]>("gt");
  const [decision, setDecision] = useState<Decision>("ask");
  const [resolveKind, setResolveKind] = useState<ResolveKind>("human");
  const [resolveName, setResolveName] = useState("");

  const buildMatch = (): MatchCondition | null => {
    const v = value1.trim();
    switch (matchType) {
      case "tool":
        return v ? { type: "tool", tool: v } : null;
      case "action":
        return v ? { type: "action", action: v, ...(value2.trim() ? { branch: value2.trim() } : {}) } : null;
      case "threshold":
        return v && value2.trim() !== "" ? { type: "threshold", metric: v, op, value: Number(value2) } : null;
      case "scope":
        return v ? { type: "scope", scope: v } : null;
      case "context":
        return v ? { type: "context", context: v } : null;
    }
  };

  const buildResolve = (): Resolve | undefined => {
    if (decision !== "ask") return undefined;
    if (resolveKind === "human") return { type: "human" };
    if (resolveKind === "check") return { type: "check", check: resolveName.trim() || "ci_green" };
    return { type: "agent", agent: resolveName.trim() || "reviewer" };
  };

  const canSave = buildMatch() !== null && (decision !== "ask" || resolveKind === "human" || resolveName.trim() !== "");

  const save = () => {
    const match = buildMatch();
    if (!match) return;
    onSave({ match: [match], decision, resolve: buildResolve() });
  };

  return (
    <Dialog
      open
      actions={
        <>
          <Button intent="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={!canSave} icon="check" intent="run" onClick={save}>
            {t("saveRule")}
          </Button>
        </>
      }
      onClose={onClose}
      title={t("newRule")}
      width="md"
    >
      <Stack gap="200">
        <Select
          label={t("matchType")}
          onValueChange={(v) => setMatchType(v as MatchType)}
          options={MATCH_TYPE_ORDER.map((m) => ({ value: m, label: t(`matcher.${m}`) }))}
          value={matchType}
        />

        {matchType === "threshold" ? (
          <Stack direction="row" gap="100">
            <TextInput label={t("metric")} onChange={(e) => setValue1(e.target.value)} placeholder="purchase.amount" value={value1} />
            <Select label={t("op")} onValueChange={(v) => setOp(v as (typeof OPS)[number])} options={OPS.map((o) => ({ value: o, label: OP_SYMBOL[o] }))} value={op} />
            <TextInput label={t("value")} onChange={(e) => setValue2(e.target.value)} placeholder="500" type="number" value={value2} />
          </Stack>
        ) : (
          <Stack direction="row" gap="100">
            <TextInput
              label={t(`matchValue.${matchType}`)}
              onChange={(e) => setValue1(e.target.value)}
              placeholder={t(`matchPlaceholder.${matchType}`)}
              value={value1}
            />
            {matchType === "action" && (
              <TextInput label={t("branch")} onChange={(e) => setValue2(e.target.value)} placeholder="main" value={value2} />
            )}
          </Stack>
        )}

        <Select
          hint={t(`decisionHint.${decision}`)}
          label={t("decision")}
          onValueChange={(v) => setDecision(v as Decision)}
          options={DECISIONS.map((d) => ({ value: d, label: t(`decision_.${d}`) }))}
          value={decision}
        />

        {decision === "ask" && (
          <Stack direction="row" gap="100">
            <Select
              label={t("resolveBy")}
              onValueChange={(v) => setResolveKind(v as ResolveKind)}
              options={(["human", "check", "agent"] as ResolveKind[]).map((k) => ({ value: k, label: t(`resolve.${k}`) }))}
              value={resolveKind}
            />
            {resolveKind !== "human" && (
              <TextInput
                label={resolveKind === "agent" ? t("resolveAgent") : t("resolveCheck")}
                onChange={(e) => setResolveName(e.target.value)}
                placeholder={resolveKind === "agent" ? "reviewer" : "ci_green"}
                value={resolveName}
              />
            )}
          </Stack>
        )}
      </Stack>
    </Dialog>
  );
}
