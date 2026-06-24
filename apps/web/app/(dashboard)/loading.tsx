import { useTranslations } from "next-intl";
import { Container, OrbitLoader, Stack } from "@zibby/design-system";

export default function DashboardLoading() {
  const t = useTranslations("common");
  return (
    <Container height="100%">
      <Stack align="center" justify="center" style={{ height: "100%" }}>
        <OrbitLoader label={t("loading")} size="lg" />
      </Stack>
    </Container>
  );
}
