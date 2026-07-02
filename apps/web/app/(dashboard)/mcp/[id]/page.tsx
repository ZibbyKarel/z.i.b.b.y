import { DetailScreen } from "../../../../features/mcp/DetailScreen";

export default async function McpServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DetailScreen serverId={id} />;
}
