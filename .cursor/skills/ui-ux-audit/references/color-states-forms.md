# Categories 4-6: Color and Contrast, Component States, Forms

## Category 4: Color, contrast, and dark mode

- **Contrast minimums (WCAG AA).** 4.5:1 for body text, 3:1 for large text (24px+ regular or 19px+ bold; the spec says 18pt/14pt) and for UI component boundaries (input borders, icons that carry meaning, focus indicators). Compute it, do not eyeball it. Failures on body text or primary CTAs are Critical; on decorative text, Warning.
- **Button contrast specifically.** Audit every CTA: white-on-white buttons, `bg-white` with `text-white`, ghost buttons over photography with no scrim or border, gradient buttons whose light end swallows the label. These ship constantly because the snapshot happened to render over a dark area.
- **Placeholder and helper text contrast.** Placeholder gray on near-white inputs frequently lands around 2.5:1. Placeholders still need to be readable (aim 4.5:1) even though they are supplementary.
- **Color is never the only signal.** Error = red border alone fails for color-blind users and weak displays. Pair color with an icon, text, or shape change. Same for success states, selected states, and chart series (add labels or patterns).
- **One accent, locked.** One accent color per page, applied consistently. A warm-gray page does not get a blue CTA in section 7 and a teal badge in the footer. Pick the accent, lock it, audit every component against it. Saturation discipline: neutral base (zinc/slate/stone family), accent saturation under control, no random neon.
- **One gray family.** Warm grays and cool grays mixed in one project read as two different products. Pick one neutral ramp.
- **Semantic colors stay semantic.** Red for destructive/error only; green for success; the accent for primary actions. Using the error red as a decorative accent trains users to ignore it. When the brand primary is itself red or coral, destructive actions still need their own distinct treatment (a clearly different shade or fill, plus a warning icon and explicit copy), otherwise danger is indistinguishable from the brand.
- **Brand color as body text.** Saturated accents are for CTAs, badges, links. Body text is near-black on near-white (or the inverse). Saturated long-form text strains reading.
- **Theme lock.** The page has one theme. Sections do not flip from dark to a cream light section and back mid-scroll; that reads as walking into a different site. A deliberate single full-theme switch as a composition device is allowed once, with a strong transition. Default: pick light, dark, or `prefers-color-scheme` at the root and lock it.

### Dark mode (when the app has one)

- **Redesigned, not inverted.** Flipping colors produces garish saturation and pure-black voids. Reduce brand-color saturation on dark; use dark grays, not #000, for the base.
- **Elevation via surface, not shadow.** On dark themes, raised surfaces get lighter backgrounds; shadows are nearly invisible. Cards/modals one step lighter than the page.
- **Same tokens, swapped values.** Dark mode swaps token values; it does not introduce new hardcoded hex values per component. If dark variants carry their own one-off colors, the token system is broken (also a Category 10 finding).
- **Media legibility.** Logos, icons, and illustrations must survive on dark. White-background images need treatment (padding-on-surface, alternate asset, or blend mode).

## Category 5: Component states

AI ships the happy path. Every interactive component is audited against ALL of these; a missing state on a primary flow is Critical, on a secondary flow Warning.

- **Loading.** Skeletons that match the final layout's shape and proportions (so nothing jumps when content arrives). Generic centered spinners only for full-page transitions. Buttons that trigger async work show a pending state and disable to prevent double submission.
- **Empty.** What does this list/table/dashboard look like with zero items? An empty state explains what would appear here and offers the action that populates it. "No results found" with no next step is a dead end.
- **Error.** Network failure, validation failure, server error, each with a recovery action (retry, edit, contact). Inline for forms, contextual toast only for transient background events.
- **Disabled.** Visually distinct beyond `opacity-50` (which disappears on busy backgrounds): reduced saturation, changed background, `cursor-not-allowed`. Ideally with a hint of why it is disabled (tooltip or helper text).
- **Hover, focus-visible, active, selected.** Each visually distinct. Active state should give tactile feedback (slight translate or scale-down) so clicks feel registered. Hover-only feedback is invisible on touch devices: critical state changes must also exist on active/focus-visible.
- **Overflow content.** What happens when the title is 200 characters, the username is 40, the number is 7 digits? Trace it; do not assume.
- **Layout reserved for state changes.** A border or ring that appears on hover/focus must have its space reserved in the default state (transparent border, or ring with offset) or the element jumps. Counters use `tabular-nums`; late-loading icons and images have reserved boxes.
- **Modals.** Focus trapped inside while open, body scroll locked, Escape closes, backdrop click closes (unless destructive context), focus returns to the trigger on close, `aria-modal="true"` with a labelled title.
- **Dropdowns and menus.** Click outside closes; arrow keys navigate; Escape closes and restores focus; long lists scroll inside the menu rather than the page.
- **Optimistic vs confirmed.** If the UI updates optimistically, there is a rollback path and an error surface for when the request fails. Silent failure after an optimistic update is data-loss territory (Blocker).
- **Crash containment.** A component throwing must not blank the whole screen: an app-level error boundary (plus per-region boundaries around risky widgets like charts and embeds) shows a recovery screen with a reload action. The white screen of death is a Blocker.

## Category 6: Forms and inputs

- **Label above input, always visible.** Placeholder-as-label is banned: it disappears on focus, fails recall, and usually fails contrast. Placeholders demonstrate format ("name@example.com"), never duplicate or replace the label.
- **Association is real.** `<label htmlFor>` matching the input `id` (or wrapping). Clicking the label must focus the field; screen readers depend on it.
- **Error placement and content.** Below the field, in text, specific and human: "Please enter a valid email" not "Invalid input". Color change alone is not an error message. The field gets `aria-invalid` and the message is associated via `aria-describedby`.
- **Validation timing.** Validate on blur or submit, not on every keystroke from the first character (premature errors while the user is still typing are hostile). After first error, live-revalidate so the error clears as soon as it is fixed.
- **Required marking.** Mark required fields (and include a legend if using `*`); or mark optional ones if most are required. Do not make users discover requirements via errors.
- **Submit behavior.** Disabled or pending state while submitting; double-submit prevented; success confirmed visibly; failure preserves user input (wiping a form on error is a Blocker).
- **Input types and keyboards.** `type="email"`, `inputmode="numeric"`, `autocomplete` attributes for name/email/address/payment fields. Mobile keyboard mismatch is a silent conversion killer.
- **Touch-friendly controls.** Checkbox/radio hit areas extended to the full label row; date pickers and selects usable on mobile; no hover-dependent form affordances.
- **Layout.** Single-column by default; related short fields (city/zip) may pair. Field width hints expected content length. Helper text sits between label and input or directly under the input, consistently across the app.
- **Destructive actions.** Confirmation names the object ("Delete 'Q3 report'?" not "Are you sure?") and the destructive button is visually distinct, not the default-focused action.
