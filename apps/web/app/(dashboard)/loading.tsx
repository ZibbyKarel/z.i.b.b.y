export default function DashboardLoading() {
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
      Loading…
    </div>
  );
}
