# Categories 10-11: Consistency at Scale, Design Tokens, Navigation, Iconography

## Category 10: Consistency at scale and design tokens

This category targets the defining AI failure: every generated component is a one-off. Because the model holds no persistent design system, the second button gets fresh padding, the third card invents a new radius, and after ten components the page contains five shadows and three grays that were all meant to be the same. Audit ACROSS components, not within them.

### Cross-component drift checks

- **Button census.** Collect every button variant in scope. There should be a small deliberate set (primary, secondary, ghost, destructive, sizes). Flag every padding/radius/weight/shadow combination that exists only once; each is drift unless documented.
- **Card census.** Same for cards: one radius, one border treatment, one shadow, one internal padding rhythm. Two cards on one screen with different radii is the classic tell.
- **Spacing rhythm across sections.** Section vertical padding, grid gaps, and stack spacing reuse the same few values everywhere. List the distinct values found; more than ~3 per role is drift.
- **Corner-radius system lock.** One radius scale for the page: all-sharp, all-soft, or a documented per-role rule ("buttons pill, cards 16px, inputs 8px") applied without exception. Round buttons in an otherwise sharp layout (or the reverse) is broken design, not variety.
- **Shadow system lock.** One elevation language: either one shadow style family at 2-3 levels, or borders/dividers instead. Mixed soft Material blurs and hard offsets on one surface is drift. Shadows tinted toward the background hue, no pure-black drops on light UI.
- **Interaction pattern consistency.** The same action behaves the same way everywhere: if one list edits inline, others do not open modals for the identical operation; destructive confirmations look the same app-wide; toasts come from one corner.
- **Same concept, same component.** Two different date pickers, two different empty-state layouts, or two different modal designs in one app means a component was regenerated instead of reused. The fix is consolidation into one shared component, not styling both.

### Design tokens health (code-level)

- **Colors are tokenized.** Components reference tokens/utilities (`bg-primary`, `var(--color-brand)`, theme values), not raw hex. Any hex value appearing 2+ times in components belongs in the config. Raw hex sprinkled through JSX is how palettes drift.
- **Semantic naming.** Tokens describe purpose, not appearance: `--color-danger`, not `--red-500` consumed directly. Purpose-named tokens survive a rebrand; appearance-named ones break.
- **Spacing, radius, shadow, and type tokenized.** Font sizes/weights/line-heights come from the scale; radii and shadows from named steps. Repeated arbitrary values (`rounded-[14px]` in six files) are an un-extracted token.
- **Dark mode swaps tokens.** Dark variants change token values centrally; components carrying their own dark hex values mean the system is bypassed.
- **Config is the source of truth.** For Tailwind: brand values live in the config/theme, not as arbitrary `[]` values scattered in markup. For CSS: custom properties at `:root`, consumed everywhere.
- **Magic number rule.** Any literal value used more than twice is a token candidate; flag it once with the consolidation fix.

## Category 11: Navigation and iconography

### Navigation

- **Current location is unmistakable.** The active nav item differs by more than a subtle shade: weight, color, or an indicator bar, meeting 3:1 contrast against inactive items, plus `aria-current="page"`.
- **Nav is identical everywhere.** Same items, same order, same style on every page. Items that appear/disappear or reorder between sections destroy the user's map.
- **Tabs vs nav.** Tabs switch views of the same content; nav moves between sections. Tabs as top-level navigation (or nav styled as tabs for in-page switching) confuses the model users build.
- **Depth gets breadcrumbs.** Pages more than two levels deep show the path; every crumb except the current page is clickable.
- **Back behaves.** Back returns to the previous screen, not out of an entire flow; modals and wizards define explicit back/close semantics so users do not lose work.
- **Overflow handling.** Too many items: horizontal scroll with affordance or a "More" menu; never clipped, never awkwardly wrapped. Desktop nav on one line (see Category 8), height capped around 64-80px; oversized agency navs eat the viewport.
- **Link integrity.** No dead `href="#"` on real navigation, no buttons doing router pushes that should be links (breaks open-in-new-tab and middle click).

### Flow-level checks (multi-step journeys)

- **Progress is honest.** Multi-step flows show position and total ("Step 2 of 4"); steps do not silently multiply after the user commits.
- **Back preserves state.** Returning to a previous step restores entered data; back never ejects the user from the whole flow without warning.
- **No dead ends.** Every error, empty, and success state offers a next action; a terminal screen with no exit is a Blocker.
- **Abandon safety.** Leaving a flow with unsaved input gets one clear confirmation, not silent loss and not a guilt trip.
- **Re-entry works.** Refresh or deep-link into a mid-flow step either restores it or lands somewhere sensible, never a broken half-state.

Scope note: this skill audits interfaces and flows as built. User research, information architecture strategy, and brand positioning are out of scope; when findings point there, say so and recommend a dedicated effort rather than improvising one.

### Iconography

- **One family, one style.** All icons from one set (Lucide, Phosphor, Material...), in one style (all outline OR all filled OR all duotone). Mixed families/styles read as mismatched even when sizes agree.
- **Consistent sizing on the grid.** Standard optical sizes: 16/20/24/32/40/48. Odd sizes (18, 22, 26) sit between optical lines. One size per role (nav icons one size, inline icons another), consistently.
- **Stroke weight consistency.** 1.5px-stroke icons next to 2px-stroke icons feel off even within "outline". Lock the weight.
- **Meaning consistency.** One icon = one meaning app-wide. A star cannot be both "favorite" and "rating"; a trash can cannot sometimes mean "archive".
- **Label pairing.** Icon-only is acceptable solely for universally understood glyphs (close, search, menu); everything else pairs with a visible label or at minimum a tooltip plus `aria-label`.
- **Alignment and shrink.** Icons optically centered against adjacent text (icon bounding boxes carry invisible padding), and `flex-shrink-0` so layouts never squash them into ellipses.
- **Emoji are not icons.** Emoji render differently per platform, carry no stroke/style consistency, and cannot be recolored. Decorative emoji in UI chrome is a slop tell (Category 14); use the icon set.
