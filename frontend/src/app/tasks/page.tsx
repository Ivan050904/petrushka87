import { redirect } from "next/navigation";

export default function TasksPage() {
  redirect("/plans?tab=tasks");
}
