import { ProjectDetailScreen } from "../../../../../features/projects/screens/ProjectDetailScreen";

/**
 * The "new project" detail page. Renders {@link ProjectDetailScreen} with no
 * id, so it shows only the basics editor; on create it redirects to
 * `/work/projects/:id` where the tabs unlock. The static `new` segment wins
 * over `[id]`.
 */
export default function NewWorkProjectPage() {
  return <ProjectDetailScreen />;
}
