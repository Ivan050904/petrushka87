import { redirect } from "next/navigation";

export default function EventsPage() {
  redirect("/plans?tab=events");
}
