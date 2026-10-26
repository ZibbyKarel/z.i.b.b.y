import { MarketplaceDetailScreen } from "../../../../../features/marketplaces/screens/MarketplaceDetailScreen";

/** `/workforce/marketplaces/[id]` — one marketplace's plugins. */
export default async function MarketplaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MarketplaceDetailScreen marketplaceId={id} />;
}
