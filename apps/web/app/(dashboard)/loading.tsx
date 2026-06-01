import { useTranslations } from "next-intl";

export default function DashboardLoading() {
  const t = useTranslations("common");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.6875rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {t("loading")}
    </div>
  );
}
