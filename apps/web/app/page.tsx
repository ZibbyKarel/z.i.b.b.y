import { redirect } from "next/navigation";

/** `/overview` is deleted (F8d, O2/O3) — `/chat` is home now, the one world the
 * whole HUD → Chat UI migration arc has been building toward. */
export default function RootPage() {
  redirect("/chat");
}
