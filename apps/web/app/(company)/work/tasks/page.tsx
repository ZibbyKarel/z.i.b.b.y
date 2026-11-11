import { redirect } from "next/navigation";

/** todo-14: the Tasks list merged into Activity → Runs; old links and pins land there. */
export default function WorkTasksPage() {
  redirect("/activity/runs");
}
