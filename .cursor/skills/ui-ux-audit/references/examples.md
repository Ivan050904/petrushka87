# Worked Examples

Read this file before producing the first report in a session. These anchor the finding format, severity judgement, and report shape. Match them exactly in structure; never copy their content into real reports.

## Example findings, one per severity

### Blocker

```
**Found:** Global stylesheet sets `*:focus { outline: none }` (globals.css) with no focus-visible replacement anywhere in the app.
**Why:** Keyboard users cannot see where they are; the app is unusable without a mouse and fails WCAG 2.4.7.
**Fix:** Remove the global reset and add a visible default: `*:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`. Override per component only with an equally visible alternative.
**Prevent:** eslint-plugin-jsx-a11y will not catch CSS resets; add an axe-core Playwright check, which flags missing focus indicators at runtime.
```

### Critical

```
**Found:** `<div className="flex items-center gap-2"><Icon/><span>{user.name}</span></div>` in UserRow.jsx; the span has no `min-w-0`, so a 40-character username pushes the row wider than its container and breaks the card grid.
**Why:** Any user with a long name breaks the layout for everyone viewing that list; flex children refuse to shrink below content size by default.
**Fix:** `<span className="min-w-0 truncate">{user.name}</span>` and `flex-shrink-0` on the icon.
**Prevent:** Playwright visual regression with a long-content fixture (200-char strings in seed data) catches every overflow of this family.
```

### Warning

```
**Found:** Three card components use three radii: `rounded-lg` (StatsCard), `rounded-xl` (ChartCard), `rounded-2xl` (NewsCard), all rendered on the same dashboard.
**Why:** Cross-component drift; the page reads as assembled from three different products and signals there is no token system.
**Fix:** Pick one card radius (the design's `rounded-lg`), apply to all three, and move it into a shared Card component so the value has one owner.
**Prevent:** Extract a `Card` primitive; once one component owns the style, drift becomes impossible.
```

### Polish

```
**Found:** `<h2 className="text-3xl font-bold">Track every market in one place</h2>` renders "place" alone on the second line at 1280px.
**Why:** A widowed word weakens the heading's visual weight; classic AI-generated typography miss.
**Fix:** Add `text-balance` to the heading classes.
```

Note the Prevent line is omitted when no tooling exists for the family (the Polish example), and never repeats a tool already recommended for the same family in the same report.

## Example full-audit report shape (condensed)

```
# UI Audit: token analytics dashboard (4 components, code input)

**Score:** 100 - (1x12) - (2x8) - (3x4) - (2x1) = 58/100
**Verdict:** Do not ship (1 Blocker). After Blocker + Criticals: re-audit, projected ~86.
**Top 3 priorities:** restore focus visibility (Blocker), add min-w-0 to all three text rows (Critical, one root cause), unify the timeframe selector so it controls all charts (Critical).

## Blockers (1)
[finding]

## Critical (2)
[findings]

## Warnings (3)
[findings]

## Polish (2)
[findings]

## Clean
Categories 1, 6, 7, 12 checked, no findings. Category 15 partially clean: tables pass, charts carry the two findings above.

## Durable fixes
1. Playwright visual regression at 360/768/1280 with long-content fixtures (prevents the overflow family, 3 findings here).
2. axe-core run per screen (prevents the focus family).
```

## Quick-review example (no score requested)

User pastes one button component and says "something feels off". Read the matching references (structure-typography, color-states-forms), respond with only the findings in severity order, severities stated, two sentences of summary, no report scaffolding:

```
Two findings, both Warning-level.

**Found:** `hover:border-2` adds a border that does not exist in the default state, so the button grows 2px and shifts its row on hover.
**Why:** State changes must not move layout; the jump reads as a glitch.
**Fix:** Keep `border-2 border-transparent` in the default state and only change the color on hover.

**Found:** Label "Submit" on a newsletter form.
**Why:** Buttons should name the outcome; "Submit" is system vocabulary.
**Fix:** "Subscribe".

Spacing, contrast, and states otherwise check out.
```
