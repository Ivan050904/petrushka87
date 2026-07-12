import { ROUTES, type TrackingTab } from "@/lib/navigation";

export function isNavItemActive(
  pathname: string,
  href: string,
  options?: { trackingTab?: TrackingTab; currentTrackingTab?: TrackingTab },
) {
  if (options?.trackingTab) {
    return pathname === ROUTES.tracking && options.currentTrackingTab === options.trackingTab;
  }
  return pathname === href || (href !== ROUTES.dashboard && pathname.startsWith(`${href}`));
}

export function formatCountBadge(value: number) {
  if (value > 9) {
    return "9+";
  }
  return String(value);
}

export function getMobilePageTitle(pathname: string): string {
  if (pathname === ROUTES.board) return "Канбан";
  if (pathname === ROUTES.notes) return "Заметки";
  if (pathname === ROUTES.transcription) return "Транскрибация";
  if (pathname === ROUTES.dashboard) return "Сегодня";
  if (pathname === ROUTES.weather) return "Погода";
  if (pathname === ROUTES.inbox) return "Входящие";
  if (pathname === ROUTES.plans) return "Планы";
  if (pathname.startsWith(ROUTES.tracking)) return "Трекинг";
  if (pathname === ROUTES.articles) return "Статьи";
  if (pathname === ROUTES.reference) return "Справочник";
  if (pathname === ROUTES.assistant) return "Ассистент";
  if (pathname === ROUTES.therapySessions) return "Сессии";
  if (pathname === ROUTES.search) return "Поиск";
  if (pathname === ROUTES.settings) return "Настройки";
  return "Folio-One";
}
