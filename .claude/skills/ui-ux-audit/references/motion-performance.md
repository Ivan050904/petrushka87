# Categories 12-13: Motion and Animation, Performance

## Category 12: Motion and animation

- **Every animation has a job.** Orient (where did this come from), give feedback (the tap registered), or show a relationship (this expanded from that). Pure decoration that loops forever is noise; AI loves scattering infinite micro-animations, which is itself a slop tell.
- **Durations.** Micro-interactions and UI transitions 150-300ms; page/route transitions 300-500ms. Under ~100ms reads as a glitch; over 500ms reads as lag users must wait for. Hover transitions ~150ms.
- **Easing.** Ease-out for entering elements (fast start, settle), ease-in for exits, ease-in-out for moves. Linear is for marquees and progress, nothing else. Springs are fine for playful contexts; keep overshoot subtle on functional UI.
- **No infinite autoplay loops** on content users must read. Looping ambience (hero background) pauses on hover/interaction and respects reduced motion. Attention-seeking loops on buttons or badges: remove.
- **Choreography.** One orchestrated moment beats scattered effects. Staggered list entrances: 20-50ms steps, capped total (do not make item 30 wait 3 seconds). Elements animating simultaneously should share timing and easing.
- **Reduced motion is mandatory.** Wrap non-essential animation in `motion-safe:` (Tailwind) or `@media (prefers-reduced-motion: reduce)` overrides: kill parallax, large zooms, auto-playing carousels; keep opacity fades. This is an accessibility requirement (vestibular disorders), not a preference.
- **Animate cheap properties only.** `transform` and `opacity` are compositor-friendly. Animating `width/height/top/left/margin/padding` forces layout every frame; animating `box-shadow` or `filter: blur()` forces expensive paints. Fix: scale/translate instead of size/position; crossfade pre-rendered shadows via a pseudo-element's opacity.
- **`will-change` is a scalpel.** Applied just before a heavy animation and removed after, on few elements. Blanket `will-change: transform` on every card eats GPU memory and can blur text.
- **Layout-shift-free states.** Animations that change an element's footprint (expanding cards, accordions) animate inside reserved space or use transform scaling, so surrounding content does not stutter downward per frame.
- **Interruptibility.** Hover in/out mid-animation reverses smoothly (CSS transitions do this free; JS animations must handle it). Animations never block input: a user who clicks during an entrance gets the click.

## Category 13: Performance

Perceived quality is performance. These are the failures AI ships because nothing in a static snapshot reveals them.

### Loading and layout stability

- **Every image and embed has dimensions.** `width`/`height` attributes or `aspect-ratio` boxes so the browser reserves space. Unsized media is the #1 source of cumulative layout shift (content jumping as things load), which users read as "broken".
- **Reserved space for async UI.** Banners, ads, embeds, and late-arriving components render into reserved containers or skeletons matching final proportions. Content injected at the top of the page after load (cookie bars pushing everything down) is a Critical.
- **Font loading strategy.** `font-display: swap` plus a metric-matched fallback (`size-adjust`/system stack tuned to the webfont) so text renders immediately and barely shifts on swap. Subset large families; do not load 6 weights to use 2.
- **Image formats and sizing.** Modern formats (WebP/AVIF) with `srcset`/`sizes` so phones do not download 2400px heroes; `loading="lazy"` on below-fold images, never on the LCP hero image (and consider `fetchpriority="high"` there).

### Runtime smoothness

- **60fps budget.** Scroll and interaction handlers do near-zero work: no layout reads (offsetHeight, getBoundingClientRect) inside scroll/resize loops without rAF batching; prefer IntersectionObserver/ResizeObserver over polling; debounce/throttle expensive reactions.
- **Layout thrash.** Alternating style writes and layout reads in a loop forces synchronous reflow per iteration. Batch reads, then writes.
- **Long lists virtualize.** Hundreds of DOM rows tank scrolling and memory; virtualize (react-window or equivalent) past ~100-200 items, or paginate. `content-visibility: auto` on long off-screen sections is a cheap win for static pages.
- **Re-render hygiene (React).** Lists keyed by stable ids (index keys cause state bleed and full re-renders on reorder); expensive subtrees memoized when parents re-render frequently; context split so a ticking clock does not re-render the app. Flag as Warning unless a measurable jank path exists.
- **Heavy effects budget.** `backdrop-filter: blur` over large scrolling areas, big `filter: drop-shadow`, and massive blurred gradient orbs are GPU-expensive, especially on mid-range phones; cap their size/count or pre-render to images.

### Payload

- **Dependency proportionality.** A date formatter does not justify a 70kb library; an icon set is imported per-icon, not as the whole pack; one charting library, not two. Flag obvious dead weight; do not nitpick kilobytes.
- **Code splitting at routes.** Heavy below-the-fold or route-specific code (editors, charts, maps) loads lazily, with skeletons reserved (see above).
- **Third-party scripts deferred.** Analytics and widgets load `defer`/after-interaction; render-blocking third-party JS in `<head>` is a Critical on marketing pages.

### Verification

When the environment allows running the app, verify rather than assume: throttle CPU 4x in devtools, check Lighthouse/Core Web Vitals (LCP under ~2.5s, CLS under 0.1, INP under 200ms), and scroll the longest list. In code-only audits, flag risk patterns and mark them "verify at runtime".
