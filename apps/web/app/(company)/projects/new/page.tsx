import { ProfileScreen } from "../../../../features/projects/ProfileScreen";

/**
 * The "new project" detail page. Renders {@link ProfileScreen} with no id, so it
 * shows only the basics editor; on create it redirects to `/projects/:id` where the
 * team, integrations and secrets unlock. The static `new` segment wins over `[id]`.
 */
export default function NewProjectPage() {
  return <ProfileScreen />;
}
