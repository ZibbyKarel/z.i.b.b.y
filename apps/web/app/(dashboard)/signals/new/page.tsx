import { SignalCreateScreen } from "../../../../features/signals/components/SignalCreateScreen";

/**
 * `/signals/new` — the guided signal-kind creator (B3b). `?from=` (set by the
 * handoff-rule editor's "+ nový signál" link-out) prefills the producer picker;
 * the static `new` segment wins over `/signals/[id]`.
 */
export default async function SignalCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <SignalCreateScreen defaultFrom={from} />;
}
