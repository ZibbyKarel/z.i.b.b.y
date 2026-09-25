import { DetailScreen } from "../../../../features/teams/DetailScreen";

/**
 * The "new team" detail page. Renders {@link DetailScreen} with no id, so it
 * shows only the basics editor; on create it redirects to `/teams/:id` where
 * the knowledge-base editor unlocks. The static `new` segment wins over `[id]`.
 */
export default function NewTeamPage() {
  return <DetailScreen />;
}
