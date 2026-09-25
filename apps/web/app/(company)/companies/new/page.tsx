import { DetailScreen } from "../../../../features/companies/DetailScreen";

/**
 * The "new company" detail page. Renders {@link DetailScreen} with no id, so it
 * shows only the basics editor; on create it redirects to `/companies/:id` where
 * the roster editor unlocks. The static `new` segment wins over `[id]`.
 */
export default function NewCompanyPage() {
  return <DetailScreen />;
}
