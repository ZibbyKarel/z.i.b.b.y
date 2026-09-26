import { GoalDetailScreen } from "../../../../../features/goals/screens/GoalDetailScreen";

export default async function WorkGoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoalDetailScreen goalId={id} />;
}
