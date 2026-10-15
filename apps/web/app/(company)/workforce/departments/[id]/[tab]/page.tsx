import { notFound } from "next/navigation";
import {
  DEPARTMENT_TABS,
  type DepartmentTab,
} from "../../../../../../features/departments/departmentTabs";
import { DepartmentScreen } from "../../../../../../features/departments/screens/DepartmentScreen";

function isDepartmentTab(value: string): value is DepartmentTab {
  return (DEPARTMENT_TABS as readonly string[]).includes(value);
}

export default async function DepartmentTabPage({
  params,
}: {
  params: Promise<{ id: string; tab: string }>;
}) {
  const { id, tab } = await params;
  if (!isDepartmentTab(tab)) notFound();
  return <DepartmentScreen departmentId={id} tab={tab} />;
}
