import { TeamDetailScreen } from "../../../../../features/teams/screens/TeamDetailScreen";

/**
 * The "new team" detail page. Renders {@link TeamDetailScreen} with no id, so it
 * shows only the basics editor; on create it redirects to `/work/teams/:id`
 * where the knowledge base and linked-projects panels unlock. The static `new`
 * segment wins over `[id]`.
 */
export default function NewWorkTeamPage() {
  return <TeamDetailScreen />;
}
