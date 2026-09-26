"use client";

import { DEPARTMENTS, type DepartmentId } from "@zibby/contracts";
import {
  Button,
  Container,
  Panel,
  SelectField,
  Stack,
  TextInputField,
  Typography,
} from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer } from "../../../components/PageContainer/PageContainer";
import { useAgentsQuery } from "../../agents";
import { useHireEmployeeMutation } from "../../employees";

export interface HireEmployeeScreenProps {
  /** Prefilled department, from `?department=` — still changeable. */
  initialDepartment?: string;
}

/**
 * D-015 hiring: pick a position (an existing agent) + an optional name, into a
 * department (required). `POST /api/departments/:id/employees` — a random free
 * pool name is used when `name` is omitted.
 */
export function HireEmployeeScreen({ initialDepartment }: HireEmployeeScreenProps) {
  const t = useTranslations("people");
  const router = useRouter();
  const { data: agents = [] } = useAgentsQuery();
  const [department, setDepartment] = useState<DepartmentId>(
    (initialDepartment as DepartmentId) ?? DEPARTMENTS[0]!.id,
  );
  const [agentId, setAgentId] = useState<string>("");
  const [name, setName] = useState("");
  const hire = useHireEmployeeMutation(department);

  const canSubmit = agentId.trim().length > 0;

  return (
    <Container padding={["300", "350"]}>
      <PageContainer>
        <Stack gap="250">
          <Typography type="title">{t("hireTitle")}</Typography>
          <Panel header={t("hireTitle")}>
            <Container padding="200">
              <Stack gap="150">
                <SelectField
                  label={t("departmentLabel")}
                  onValueChange={(v) => setDepartment(v as DepartmentId)}
                  options={DEPARTMENTS.map((d) => ({ value: d.id, label: d.name }))}
                  value={department}
                />
                <SelectField
                  label={t("positionLabel")}
                  onValueChange={setAgentId}
                  options={agents.map((a) => ({
                    value: a.id,
                    label: a.displayName ?? a.name ?? a.id,
                  }))}
                  value={agentId}
                />
                <TextInputField
                  hint={t("nameHint")}
                  label={t("nameLabel")}
                  onChange={(e) => setName(e.target.value)}
                  value={name}
                />
                <Button
                  disabled={!canSubmit || hire.isPending}
                  icon="check"
                  intent="primary"
                  loading={hire.isPending}
                  onClick={() =>
                    hire.mutate(
                      {
                        params: { id: department },
                        body: { agentId, ...(name.trim() ? { name: name.trim() } : {}) },
                      },
                      { onSuccess: (res) => router.push(`/org/people/${res.body.id}`) },
                    )
                  }
                >
                  {t("hire")}
                </Button>
              </Stack>
            </Container>
          </Panel>
        </Stack>
      </PageContainer>
    </Container>
  );
}
