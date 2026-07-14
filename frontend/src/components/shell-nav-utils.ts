import { ROUTES, type TrackingTab } from "@/lib/navigation";

export function normalizeShellPathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isNavItemActive(
  pathname: string,
  href: string,
  options?: { trackingTab?: TrackingTab; currentTrackingTab?: TrackingTab },
) {
  const currentPath = normalizeShellPathname(pathname);
  const targetPath = normalizeShellPathname(href.split("?")[0] ?? href);

  if (options?.trackingTab) {
    return currentPath === ROUTES.tracking && options.currentTrackingTab === options.trackingTab;
  }

  if (currentPath === targetPath) {
    return true;
  }

  if (targetPath === ROUTES.dashboard) {
    return false;
  }

  return currentPath.startsWith(`${targetPath}/`);
}

export function formatCountBadge(value: number) {
  if (value > 9) {
    return "9+";
  }
  return String(value);
}

export function getMobilePageTitle(pathname: string): string {
  const path = normalizeShellPathname(pathname);
  if (path === ROUTES.board) return "Канбан";
  if (path === ROUTES.notes) return "Заметки";
  if (path === ROUTES.transcription || path === "/transcription") return "Транскрибация";
  if (path === ROUTES.dashboard) return "Сегодня";
  if (path === ROUTES.weather) return "Погода";
  if (path === ROUTES.inbox) return "Входящие";
  if (path === ROUTES.plans) return "Планы";
  if (path.startsWith(ROUTES.tracking)) return "Трекинг";
  if (path === ROUTES.articles) return "Статьи";
  if (path === ROUTES.reference) return "Справочник";
  if (path === ROUTES.assistant) return "Ассистент";
  if (path === ROUTES.therapySessions) return "Сессии";
  if (path === ROUTES.search) return "Поиск";
  if (path === ROUTES.settings) return "Настройки";
  return "Folio-One";
}
