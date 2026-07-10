/** Returns inclusive ISO date range for a YYYY-MM month string. */
export function monthRange(month: string): [string, string] {
  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 1 || monthIndex > 12) {
    const now = new Date();
    const fallbackYear = now.getFullYear();
    const fallbackMonth = now.getMonth() + 1;
    const lastDay = new Date(fallbackYear, fallbackMonth, 0).getDate();
    const mm = String(fallbackMonth).padStart(2, "0");
    return [`${fallbackYear}-${mm}-01`, `${fallbackYear}-${mm}-${String(lastDay).padStart(2, "0")}`];
  }
  const lastDay = new Date(year, monthIndex, 0).getDate();
  const mm = String(monthIndex).padStart(2, "0");
  return [`${year}-${mm}-01`, `${year}-${mm}-${String(lastDay).padStart(2, "0")}`];
}

export function currentMonthValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [yearPart, monthPart] = month.split("-");
  const date = new Date(Number(yearPart), Number(monthPart) - 1 + delta, 1);
  const year = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${mm}`;
}

export function formatMonthLabel(month: string): string {
  const [yearPart, monthPart] = month.split("-");
  const date = new Date(Number(yearPart), Number(monthPart) - 1, 1);
  return new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
}

export function formatIsoDateRu(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return isoDate;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}
