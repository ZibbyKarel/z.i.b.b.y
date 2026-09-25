import { redirect } from "next/navigation";

/** `/knowledge` has no screen of its own — it always means the vault. */
export default function KnowledgePage() {
  redirect("/knowledge/vault");
}
