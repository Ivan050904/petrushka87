import { redirect } from "next/navigation";

export default function HabitsPage() {
  redirect("/tracking?tab=habits");
}
