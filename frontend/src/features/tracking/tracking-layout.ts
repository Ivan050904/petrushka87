/** Full-width shell aligned with Plans / Dashboard */
export const TRACKING_SHELL =
  "mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col xl:min-h-[calc(100dvh-8rem)]";

/** Desktop: fill viewport below app header */
export const TRACKING_VIEWPORT_H = "xl:min-h-[calc(100dvh-8rem)]";

/** Form column grows on large screens; stacks on mobile */
export const TRACKING_GRID_COLS =
  "xl:grid xl:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]";

/** Two-column grid that stretches on desktop */
export const TRACKING_GRID = `grid flex-1 min-h-0 gap-3 ${TRACKING_GRID_COLS} ${TRACKING_VIEWPORT_H}`;

/** Mobile: scroll inside tab panel; desktop: scroll inside column */
export const TRACKING_MOBILE_SCROLL =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain max-xl:pb-[env(safe-area-inset-bottom)]";

/** Scroll inside columns on desktop; on mobile columns grow with panel scroll */
export const TRACKING_SCROLL_COL =
  "min-h-0 max-xl:overflow-visible xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto";

/** @deprecated use TRACKING_SCROLL_COL */
export const TRACKING_PANEL_MAX_H = "xl:max-h-[calc(100dvh-8rem)]";
