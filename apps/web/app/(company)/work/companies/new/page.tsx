import { CompanyDetailScreen } from "../../../../../features/companies/screens/CompanyDetailScreen";

/**
 * The "new company" detail page. Renders {@link CompanyDetailScreen} with no id,
 * so it shows only the basics editor; on create it redirects to
 * `/work/companies/:id` where the contacts/projects panels unlock. The static
 * `new` segment wins over `[id]`.
 */
export default function NewWorkCompanyPage() {
  return <CompanyDetailScreen />;
}
