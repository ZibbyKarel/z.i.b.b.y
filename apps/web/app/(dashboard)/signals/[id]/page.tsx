import { SignalDetailScreen } from "../../../../features/signals/components/SignalDetailScreen";

export default async function SignalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SignalDetailScreen signalId={id} />;
}
