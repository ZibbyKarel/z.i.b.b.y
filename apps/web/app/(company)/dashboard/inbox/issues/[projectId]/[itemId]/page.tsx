import { InboxItemScreen } from "../../../../../../../features/inbox/screens/InboxItemScreen";

export default async function InboxItemPage({
  params,
}: {
  params: Promise<{ projectId: string; itemId: string }>;
}) {
  const { projectId, itemId } = await params;
  return <InboxItemScreen itemId={itemId} projectId={projectId} />;
}
