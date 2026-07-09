import { formatDate } from "@/lib/entry-helpers";

export function formatCaptureDeadline(value: unknown) {
  const deadline = typeof value === "string" ? value : "";
  if (!deadline) {
    return "Без даты";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    const [year, month, day] = deadline.split("-").map(Number);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
    }).format(new Date(year, month - 1, day));
  }
  return formatDate(deadline);
}
