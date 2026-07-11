# Project Profile: Data-Dense SaaS Dashboard

Professional SaaS / admin / analytics / internal-tool dashboards: data-dense, used daily by repeat power users, often keyboard-heavy, often behind auth. When this profile applies, the rules below OVERRIDE the universal defaults in the other reference files; everything not mentioned here keeps its universal rule.

Detection: admin/dashboard/analytics/console/reports/settings routes; auth-gated internal tooling; screens dominated by data tables, charts, KPI cards, filters, or bulk-action toolbars; B2B/operator/back-office framing; or the user saying so.

Source of truth: when the repo is available, read the theme/token files, the table/chart component library, and any keyboard-shortcut or design-system docs before auditing. This profile describes the patterns; the config holds the exact values. If they conflict, the config wins and the conflict is itself a finding. Most of this category routes into Category 15 — read `references/data-viz-tables.md` and treat its checklist as primary for any view containing tables, charts, or KPIs.

## Overrides: density is the feature (replaces universal whitespace bias)

- **Information density is a deliverable, not a flaw.** A power user scanning 200 rows wants more on screen, not generous whitespace. Do NOT flag "needs more breathing room", oversized cards, or marketing-page padding as improvements here; the opposite — airy layouts that force scrolling past data the user came for — is the Warning. The whitespace-maximalist instinct is wrong for this category.
- **But density must not cost scannability.** Dense is allowed; cramped-and-unreadable is not. Enforce a consistent vertical rhythm within the dense scale, clear column/section grouping, and alignment grids so the eye tracks rows and columns cleanly. Density that destroys legibility (touching text, no row separation, inconsistent gutters) is still a Warning.
- **Body text floor relaxes to 13-14px for tabular/secondary data** where the universal 16px would halve rows-per-screen; keep 16px for primary reading prose and dialogs. Sub-13px data text is a Warning (Critical below ~11px or at AA contrast failure).

## Overrides: touch and pointer (replaces universal floors)

- **Precise-pointer context: 44px targets are acceptable, do NOT impose a kids-style 56-64px floor.** These are mouse/trackpad/keyboard tools on desktop. A 44px (or even a deliberate 32px dense-control) target is fine; the universal Critical-below-floor escalation does not apply on confirmed pointer-fine surfaces.
- **Spacing, not size, is the real risk in dense rows.** Row-level actions (delete, edit, row checkbox) packed edge-to-edge cause mis-clicks on the wrong row. Require adequate hit-area separation and a clear hover/active row highlight so the user sees which row a click lands on. Mis-clickable adjacent destructive controls in a dense row: Critical.
- **If the same dashboard ships a documented touch/tablet surface**, the universal 44px floor reapplies there at Warning — verify per surface, do not assume desktop-only.

## Overrides: keyboard efficiency is first-class

- **Power users live on the keyboard. Treat keyboard support as a primary path, not an a11y afterthought.** Missing keyboard operability on a core flow escalates one level above its usual severity.
- **Shortcuts and a discoverable map.** Frequent actions (search/command palette, create, save, navigate rows, submit filters) should have shortcuts with a visible reference (`?` overlay or menu hints). Shortcuts that collide with browser/AT defaults, or fire while typing in an input, are a Warning.
- **Logical, visible focus order through dense controls.** Tab moves through filters → table → row actions predictably; focus is always visible (never removed — Blocker per universal); arrow-key navigation within grids/menus where the pattern expects it. A focus order that scatters across a toolbar is a Warning.
- **Command palette / global search**, where present, is keyboard-reachable from anywhere and traps focus correctly while open.

## Overrides: tables and charts are first-class (route to Category 15)

These are the core of the product, so Category 15 findings here carry full weight rather than being optional add-ons:

- **Tables:** numeric columns right-aligned with `tabular-nums`; units in the header not every cell; sticky header row (and sticky identifying first column on wide tables); sortable headers that show current column + direction; one consistent dense row height with adequate hit area; column priority/collapse instead of shrinking to 9px; skeleton rows on load (not a spinner replacing the table); empty state that says why and is distinct from an error; pagination or virtualization past a few hundred rows. **Empty vs zero:** an empty result ("No results for these filters") must never render as an authoritative `0` that reads as real data.
- **Charts:** titled axes with units; honest axes (truncated y-axis that exaggerates a trend is a credibility Blocker on analytics); colorblind-safe, product-stable series colors; locked semantic color (green=up everywhere or nowhere); tooltips that work on the pointer in use and don't clip; chart-shaped skeletons; explicit empty-data state, never a flatline-at-zero.
- **Number formatting is one rule set product-wide**; per-metric precision restraint (show what supports the decision, not what the API returns). Conflicting counts for the same concept across two widgets is a Critical trust failure.

## Overrides: dark mode is expected (raises severity)

- **Dark mode is a baseline expectation, not a nice-to-have, in this category.** A missing or broken dark theme is a Warning here (not the universal Polish), and missing-token escalates accordingly.
- **Token parity across themes.** Every semantic token (surfaces, borders, text, chart series, status colors, focus ring) has a working value in both themes; charts/data-viz palettes must be defined per theme, not reused from light onto dark. Hardcoded hex that survives a theme switch, or chart colors that vanish/clash on dark, is a Warning. Contrast must pass AA in BOTH themes — re-check, don't assume.

## Overrides: persistent structure and deep-link state

- **Persistent global navigation** (sidebar/top bar) stays put across views; the current section is always indicated. **Breadcrumbs** on nested/drill-down views so the user knows depth and can climb back.
- **State lives in the URL.** Active filters, sort, pagination, selected tab, date range, and opened detail should survive reload, back/forward, and link-sharing. A filtered/sorted view that resets to default on refresh, or can't be linked to a colleague, is a Warning (Critical when it silently discards work the user spent effort building).
- **Saved filters / saved views.** Where the product offers them, surface the active saved view by name, show when the current state has unsaved edits, and make reset/clear obvious. Silent loss of a saved view's parameters is a Critical.

## Overrides: bulk actions and multi-select

- **Multi-select has all its states.** Visible per-row selected state, a header "select all" with an indeterminate (some-selected) state, a persistent selection count, and select-all-across-pages disambiguated from select-all-on-page. A "select all" that silently means only the visible page is a Warning.
- **A bulk-action toolbar appears on selection**, states how many rows it will affect, and clears selection predictably after the action. Disabled bulk actions explain why.

## Overrides: destructive actions, latency, and loading at scale

- **Destructive actions need confirmation AND recovery.** Bulk delete / irreversible writes require explicit confirmation (typed name or count for high-stakes deletes) and, wherever feasible, an undo window — confirmation alone is not enough at operator scale. No-confirm, no-undo destructive bulk action: Blocker (data-loss risk).
- **Latency feedback for server round-trips.** Every action that hits a server shows immediate state (optimistic update, inline spinner on the control, or a disabled+pending state) and a clear success/failure outcome; long jobs (exports, recomputes) report progress and don't look frozen. A button that silently does nothing for 2s while the request flies is a Warning (Critical on a destructive or money-moving action).
- **Loading at scale matches the dense layout.** Skeletons mirror the real dense table/grid (rows, columns, KPI-card anatomy), not one centered spinner that triggers layout shift on resolve. Support partial/streamed data honestly: show what's loaded with a clear pending indicator for the rest; never present a partial result as complete.

## What not to flag (category-specific)

- Density itself, small-but-legible data type, 32-44px precise-pointer controls, terse expert labels and abbreviations the domain uses, and high column counts are correct for this category — not findings.
- Established data conventions (accounting negatives in parentheses, ranked-list numbering, unit suffixes, fixed per-type decimal precision) are convention, not drift.
