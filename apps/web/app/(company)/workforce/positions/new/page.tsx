import { redirect } from "next/navigation";

/** Legacy route — agents were once called positions. */
export default function PositionsNewPage() {
  redirect("/workforce/agents/new");
}
