# Categories 1-3: Typography, Layout and Spacing, Visual Hierarchy

Tailwind classes are given as the primary vocabulary; every rule has a plain-CSS equivalent and applies to any stack.

## Category 1: Typography and text breaking

- **Widows and orphans.** A single word alone on the last line of a heading is the single most common AI failure. Use `text-balance` on headings, `text-pretty` on paragraphs, or `&nbsp;` between the final two words, or a tighter `max-w-*` so the line breaks earlier.
- **Awkward line breaks.** Phrases like "5 minute" or proper nouns splitting across lines. `whitespace-nowrap` on small atomic chunks, `<span className="inline-block">` for word groups that must stay together.
- **Font size floor.** Body below 16px triggers iOS auto-zoom on inputs and strains readability. Body 16px minimum on web; small print 14px absolute floor with limited use.
- **Line height.** Defaults are too tight for paragraphs. Body `leading-relaxed` (1.625); headings can sit at `leading-tight` (1.25). Display type at `leading-none` clips italic descenders (y g j p q): use at least `leading-[1.1]` plus bottom padding reserve when italics appear in display sizes.
- **Line length.** 45 to 75 characters per line. Cap reading containers with `max-w-prose` or `max-w-[65ch]`. Full-width paragraphs on desktop are a Critical readability failure, not a style choice.
- **Letter spacing.** `tracking-wide` on all-caps labels; no added tracking on lowercase body. Large display sizes often want `tracking-tight`.
- **Long words and overflow.** Usernames, URLs, and compound words blow out flex children. `break-words` or `overflow-wrap: anywhere` on text containers; `min-w-0` on flex children that hold text (flex items default to `min-width: auto` and refuse to shrink, which is the root cause of most overflow bugs).
- **Truncation needs all its pieces.** Single line: `truncate` (= overflow-hidden + text-ellipsis + whitespace-nowrap). Multi-line: `line-clamp-N`. AI routinely ships one piece of the three and the ellipsis never appears.
- **Tabular figures.** Timers, scores, prices, and table numbers need `tabular-nums` so digits do not jitter or reflow as values change.
- **Heading hierarchy.** h1 then h2 then h3, no skipping. The tag is semantics; the class is size. Never pick a tag for its default font size.
- **Quote and apostrophe consistency.** Curly quotes and apostrophes in body copy, straight in code. Mixed within one page is a Polish finding.
- **Font loading.** Custom fonts need `font-display: swap` (or the framework equivalent) and a metric-compatible fallback so text neither vanishes (FOIT) nor jumps on swap. This is also a Performance category item; flag it once.

## Category 2: Layout and spacing

- **Stay on the spacing scale.** The Tailwind scale (1, 2, 3, 4, 6, 8, 12, 16...) or an 8px grid. Arbitrary values like `mt-[13px]`, `gap-[7px]`, `w-[247px]` mean either the scale has the value already or the layout is wrong and a magic number is papering over it. Trace the real cause before "fixing" the number.
- **One rhythm per surface.** Card grids using `gap-3` in one section and `gap-4` in another for no reason; sections alternating `py-12` and `py-16` randomly. Pick the rhythm and apply it everywhere.
- **Asymmetric padding only when intentional.** `px-4 py-3` on a button is a choice; `p-3.5` next to `p-4` across sibling components is drift.
- **Flex overflow mechanics.** `min-w-0` on the flex child that holds text; `flex-shrink-0` on icons and avatars so they never deform. This pair fixes the majority of "content pushed the layout apart" bugs.
- **Fixed-width sibling starving a text column.** A button, toggle, icon group, or badge sharing a horizontal row with text steals width from the text, which then collapses into a one-word-per-line ribbon or breaks an unbreakable token (email, URL, id) mid-value. The trap: `min-w-0`/`break-words` only control HOW the text wraps, not the starvation — the real fix is WIDTH. Give the text its own full-width row and move the control onto a row below it; for a label/value pair, stack the value under the label so it keeps full width (a `justify-between` row breaks a timestamp mid-number, `12:22:06` → `1` / `2:22:06`, at narrow widths). Verify with realistic long content (a 40+ character email, a full-sentence label) at the narrowest target viewport — "it wraps fine" reasoning is exactly how this ships. Critical at common mobile widths; Warning otherwise.
- **Fixed dimensions on variable content.** `h-[400px]` on a card whose content can grow guarantees clipping. Use `min-h-*` or let content size the box. Fixed heights are for media and decorative regions only.
- **Spacing collapse and doubling.** Mixing `space-y-*` on a parent with `mt-*` on children doubles gaps. Margins between sections defined on both the section bottom and the next section top do the same. One owner per gap; prefer `gap` in flex/grid parents.
- **Centering anti-patterns.** `mx-auto` plus fixed width inside a flex parent, or stacking three different centering mechanisms. One mechanism, usually the parent's `justify-center`/`items-center` or `place-items-center` in grid.
- **Z-index ladder.** Define a small scale and stick to it: content 0-10, sticky headers 30, dropdowns 40, modals 50, toasts/tooltips 60. `z-[9999]` is an escalation smell; a modal below a sticky header (modal z-5, header z-10) is a Blocker waiting for a click.
- **Unit discipline.** Tailwind scale (rem-based) or px for arbitrary values, not both randomly. Borders in px are fine; type and spacing should not mix systems within one component.
- **Container ownership of CSS specificity.** Section-level selectors and element-level selectors fighting each other (paddings cancelling, margins overriding) is a classic AI-generated CSS bug in non-Tailwind code. Each spacing decision should have exactly one author.
- **Duplicate and conflicting utility classes.** `px-4 px-2`, `text-sm text-base`, `flex grid`, `text-center text-left`. The last one wins but the duplication signals a broken mental model and often a real visual bug. Flag every instance; the Prevent line is the Tailwind lint plugin (see durable-fixes).

## Category 3: Visual hierarchy and focus

- **One primary action per screen.** Exactly one element should be obviously most important. If a section presents 4+ sibling choices with identical size, weight, and background and none is primary, users stall (Warning); 6+ undifferentiated options is a Critical overchoice failure. Demote, group, or collapse. Content lists, nav menus, and tables are exempt; this applies to action-oriented UI.
- **Size maps to importance.** The largest text on screen should be the most important thing. If body copy and the primary CTA share a font size with no weight or color differentiation, the CTA has no signal.
- **Contrast maps to importance.** High contrast pulls the eye. Decorative elements at full contrast while the primary action sits at 60% opacity is inverted hierarchy.
- **Scan paths.** Users scan in F or Z patterns on content-heavy layouts. Key info and the primary action belong on those paths, not buried bottom-center-right in a dense grid.
- **Duplicate CTA intent.** "Get in touch", "Contact us", and "Let's talk" on one page are three labels for one intent. Pick one label per intent and reuse it everywhere (nav, hero, footer). Multiple labels for the same action read as three different actions and dilute the click.
- **Hero discipline (marketing/landing surfaces).** The hero must fit the initial viewport: headline max 2 lines on desktop, subtext max roughly 20 words, primary CTA visible without scrolling. Max 4 text elements in the hero (eyebrow OR brand strip, headline, subtext, CTAs). Trust logos, pricing teasers, and feature bullets move to their own sections below. A 4-line hero headline is a font-size error, not a copy problem; sensible default range is text-4xl to text-6xl, reserving text-7xl+ for 3-5 word headlines.
- **Section layout repetition.** Once a layout family is used (3-column cards, full-width quote, image-left/text-right split), it should appear at most once more on the page. Three consecutive alternating zigzag image/text splits is the template tell; break the pattern with a full-width section, a vertical stack, or a grid of different shape.
- **Eyebrow restraint.** The small uppercase wide-tracked label above a section heading is fine occasionally; above EVERY section it produces the templated AI rhythm. Cap at roughly one eyebrow per three sections; the heading alone usually suffices.
- **Whitespace is structure.** Group related elements with proximity before reaching for borders and cards. If every group needs a box to read as a group, the spacing system has failed.
