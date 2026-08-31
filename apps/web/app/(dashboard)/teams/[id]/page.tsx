import { DetailScreen } from "../../../../features/teams/DetailScreen";

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetailScreen teamId={id} />;
}
