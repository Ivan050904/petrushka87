# Categories 7-9: Touch and Interaction, Responsive, Accessibility

## Category 7: Touch and interaction

- **Touch target floor.** 44x44px practical minimum (Apple HIG and WCAG AAA; the WCAG 2.2 AA legal floor is only 24px, but treat 44px as the real-world bar); 48px is the comfortable Android baseline. Icons used as buttons get padding to reach the floor: a 24px icon needs roughly 10-12px padding all around. Project profiles may raise this floor (see the active profile, e.g. the kids-app example).
- **Spacing between targets.** At least 8px between adjacent tappable elements so a thumb cannot hit both. Dense icon rows (table row actions) are the usual offender.
- **Visual size vs hit area.** If the design wants a small-looking control, extend the hit area with inner padding or a pseudo-element, not by inflating the visual.
- **Press feedback.** Every tap needs visible confirmation that it registered: `active:scale-[0.98]` or a 1px translate or shadow shift. Static buttons feel broken on touch.
- **Tap highlight and selection.** Customize `-webkit-tap-highlight-color` and pair with an explicit active state. Game-like or rapidly tapped UI also needs `touch-action: manipulation` (kills the 300ms double-tap-zoom delay) and `select-none` so long presses do not trigger text selection or callouts.
- **Hover is an enhancement.** Anything required to operate the UI (revealing actions, showing prices, opening menus) must work without hover. Hover-revealed row actions need a touch alternative (always visible on touch, or a kebab menu).
- **Safe areas.** Bottom navs, FABs, and toasts respect `env(safe-area-inset-bottom)` (and top for notches in fullscreen). A CTA under the iOS home indicator is a Blocker on the devices that matter.
- **Scroll behavior.** Momentum scrolling preserved; no scroll hijacking; horizontal carousels use scroll-snap and do not trap vertical page scrolling; pull-to-refresh not accidentally triggered by in-app gestures.
- **Drag and gesture affordances.** Draggables look draggable (handle, cursor) and have a non-drag alternative (buttons, keyboard) for reordering.

## Category 8: Responsive and adaptive

- **Test the narrow truth: 360px.** Mentally (or actually) render at 360px wide. Any horizontal scroll is a Critical; find the fixed width, unwrapped flex row, or missing `min-w-0` causing it.
- **Breakpoint coverage.** Layouts defined at mobile AND desktop, with the awkward middle (tablet, ~768px) checked: two-column layouts that look right at 1280px often produce 140px-wide squeezed columns at 800px.
- **Explicit collapse per section.** Every multi-column layout declares its sub-768px behavior in the same component. "Tailwind will handle it" is how 5-column grids end up as 5 stacked full-width sections with no spacing adjustments.
- **Type scales across viewports.** Display text steps down on mobile (`text-6xl` desktop hero is `text-4xl` on phone); body text does not shrink below the floor. Use responsive type classes or `clamp()`.
- **Touch floors survive shrinking.** Buttons sized with relative units can drop below 44px at small widths; set `min-h-*`/`min-w-*` floors.
- **Don't hide, reorder.** `hidden md:block` on meaningful content makes it invisible to the majority mobile audience. Reorder, collapse into disclosure, or redesign; hide only true redundancies.
- **Navigation collapse.** Desktop nav fits one line (condense or move items to a menu otherwise; a two-line desktop nav is broken). Mobile gets a deliberate pattern: bottom bar for 3-5 primary destinations, hamburger/sheet for secondary.
- **Modals on mobile.** Centered dialog cards become full-screen or bottom sheets under ~640px; a 320px-wide centered modal with internal scrolling is hostile.
- **Media fluidity.** `max-w-full h-auto` on images; videos and iframes in aspect-ratio boxes; tables get horizontal scroll containers or a stacked mobile rendering, never page-wide overflow.
- **Orientation and short viewports.** Landscape phones and small laptop windows (700px tall) must not hide primary CTAs below the fold inside non-scrolling heroes (`h-screen` heroes with content beyond 100vh are the usual bug; prefer `min-h-screen` or `svh` units).
- **Hover/pointer media queries.** Fine-pointer affordances gated with `@media (hover: hover)` where they would misfire on touch.

## Category 9: Accessibility

Beyond contrast (Category 4) and forms (Category 6), which already carry their a11y rules:

- **Semantic elements.** `<button>` for actions, `<a href>` for navigation; never `<div onClick>`. Lists are `<ul>/<ol>`, page regions use landmarks (`<nav>`, `<main>`, `<header>`, `<footer>`). Semantics give keyboard and screen-reader behavior for free; divs give nothing.
- **Keyboard completeness.** Every action reachable and operable by keyboard alone: logical tab order following visual order, Enter/Space activating controls, Escape closing overlays, arrow keys in menus/tabs/radio groups. Walk the page as a keyboard user during a full audit.
- **Focus visibility.** `outline-none` without a `focus-visible:` replacement is a Blocker. Focus indicators meet 3:1 contrast and are not clipped by `overflow-hidden` parents.
- **Focus management on change.** Route changes move focus to the new page heading; opening a modal moves focus in; closing restores it; deleting an item moves focus to a sensible neighbor. Lost focus (reset to body) strands keyboard users.
- **Names for everything interactive.** Icon-only buttons get `aria-label`; inputs get labels; links make sense out of context ("View invoice #341", not "Click here").
- **Images.** Meaningful images get descriptive `alt`; decorative images get `alt=""` (empty, present). Text baked into images is a failure: real text instead.
- **ARIA: less, but correct.** Prefer native elements over ARIA recreations. Where used: state attributes kept in sync (`aria-expanded`, `aria-selected`, `aria-current="page"` on active nav), live regions (`aria-live="polite"`) for async status messages like "Saved" or validation summaries.
- **Motion and vestibular safety.** All non-essential animation wrapped in `motion-safe:` or behind `prefers-reduced-motion`; parallax and large zooms are the worst offenders. (Details in Category 12.)
- **Zoom and reflow.** Page remains usable at 200% browser zoom and 320px-equivalent reflow; no content or controls lost. Avoid disabling pinch zoom (`user-scalable=no` is banned).
- **Target the standard, note the law.** Audit against WCAG 2.2 AA. For public-sector or EU-consumer-facing products, note that the European Accessibility Act makes much of this legally required, which can raise severity of a finding to Blocker.
