"use client";

import type { ChainInput } from "@zibby/contracts";
import { Button, Container, Panel, Stack, Typography } from "@zibby/design-system";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { slug } from "../../../utils/slug";
import { ChainEditor } from "../components/ChainEditor";
import { usePutChainMutation } from "../mutations";

/**
 * `/work/chains/new` — ZB-05b: a create page, prefilled by `ChainEditor`'s own
 * default (an empty two-step `dev → qa` chain). The chain's id is a slug of
 * its label (mirrors `CompanyDetailScreen`'s new-company id derivation);
 * `PUT /api/handoff/chains/:id` create-or-replaces by that minted id.
 */
export function ChainNewScreen() {
  const t = useTranslations("chainsWork");
  const router = useRouter();
  const putChain = usePutChainMutation();

  function save(input: ChainInput) {
    const id = slug(input.label) || `chain-${Date.now()}`;
    putChain.mutate(
      { params: { id }, body: input },
      { onSuccess: () => router.push(`/work/chains/${id}` as Route) },
    );
  }

  return (
    <Container padding={["300", "350"]}>
      <Stack gap="200">
        <Stack gap="50">
          <Typography mono size="2xs" tracking="wider" type="note" variant="tertiary">
            {t("eyebrow")}
          </Typography>
          <Typography type="h1">{t("new.title")}</Typography>
        </Stack>

        <Panel padding="300">
          <ChainEditor onSave={save} saveLabel={t("new.submit")} saving={putChain.isPending} />
        </Panel>

        <Button intent="ghost" onClick={() => router.push("/work/chains" as Route)} size="sm">
          {t("detail.back")}
        </Button>
      </Stack>
    </Container>
  );
}
