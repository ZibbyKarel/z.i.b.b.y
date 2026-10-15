import { HireEmployeeScreen } from "../../../../../features/departments/screens/HireEmployeeScreen";

export default async function HireEmployeePage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string }>;
}) {
  const { department } = await searchParams;
  return <HireEmployeeScreen initialDepartment={department} />;
}
