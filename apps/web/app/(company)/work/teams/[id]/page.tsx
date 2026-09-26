import { TeamDetailScreen } from "../../../../../features/teams/screens/TeamDetailScreen";

export default async function WorkTeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamDetailScreen teamId={id} />;
}
