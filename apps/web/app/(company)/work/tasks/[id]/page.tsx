import { TaskDetailScreen } from "../../../../../features/tasks/screens/TaskDetailScreen";

export default async function WorkTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TaskDetailScreen taskId={id} />;
}
