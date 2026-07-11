# Category 15: Data Visualization, Tables, and Dashboards

Audit this category whenever the scope contains tables, charts, KPIs, or dashboards. Data UI fails differently from marketing UI: the failures are precision, comparability, and honesty, and AI ships all three because sample data never stresses them.

## Tables

- **Alignment by type.** Numeric columns right-aligned with `tabular-nums` so magnitudes compare down the column; text left-aligned; never center-align data columns. Currency and percent symbols consistent per column.
- **Units live in the header**, not repeated in every cell ("Price (USD)", then bare numbers).
- **Sticky context.** Long tables keep the header row visible (`sticky top-0`); very wide tables keep the identifying first column sticky. Without anchors, scrolled data is anonymous numbers.
- **Sort affordance shows state.** Sortable columns indicate the current sort column and direction; clicking toggles predictably. Invisible sort state is a Warning.
- **Density and scanning.** Row height consistent; choose one separator strategy (zebra, hairlines, or whitespace), not a mix. 10+ column tables need column priority: hide or collapse secondary columns on smaller widths rather than shrinking everything to 9px.
- **Mobile strategy is explicit.** Horizontal scroll inside a contained scroller with visible affordance, or card-collapse per row. Page-wide overflow from a table is a Critical (Category 8 rule applied here).
- **Long values truncate with recovery.** Truncated cells (addresses, hashes, long names) expose the full value on hover/tap/copy. For blockchain addresses, middle-ellipsis (`0x1a2b...9f8e`) beats end-truncation since both ends carry signal.
- **Numbers format consistently.** One rule set for the whole product: thousands separators, fixed decimal places per data type, consistent abbreviation thresholds (1.2M, 458K), locale-aware separators. Three different decimal precisions for the same metric in one view is a Critical trust failure.
- **States.** Tables get the full Category 5 treatment: skeleton rows on load (not a spinner replacing the table), an empty state that says why ("No trades in this period") and is distinct from an error, and pagination/virtualization past a few hundred rows (Category 13).

## Charts

- **Labeled or it is decoration.** Title says what is measured; axes carry labels and units; time axes use sensible tick density (not 47 overlapping date labels on mobile).
- **Axis integrity.** A truncated y-axis that exaggerates a trend is a credibility Blocker on analytics products. Start value axes at zero for bar charts; if a line chart zooms the range for legibility, make the range visible.
- **Series discipline.** Colorblind-safe palette for multiple series; direct labeling at line ends beats a legend when series are few; past ~6 series, group or filter instead of rainbow spaghetti. Series colors stay stable across the product (the same asset is always the same color).
- **Semantic color is locked.** If green means up/positive anywhere, it means that everywhere, and never doubles as a neutral accent in the same view.
- **Tooltips work on touch** (tap, not hover-only) and do not clip at chart edges or under fingers.
- **Loading and empty.** Skeleton shaped like the chart (axes + ghost bars), not a layout-shifting spinner; an explicit empty-data state instead of an authoritative-looking flatline at zero, which reads as real data.
- **Responsive behavior declared.** Legends reposition, tick counts drop, and aspect ratios adjust at small widths; a desktop chart scaled down to 320px with 9px labels is unread.
- **Sparklines need anchors.** A bare squiggle is unreadable; give min/max, a baseline, or the current value beside it.

## Dashboards and KPIs

- **One primary answer per view.** The most important KPI is visually dominant; 12 equal-weight cards is the overchoice failure (Category 3) applied to data.
- **Consistent card anatomy.** Every KPI card shares one structure: label, value, change indicator, timeframe, in the same positions with the same formatting. Drift here is the Category 10 census applied to data cards.
- **Comparability.** Adjacent charts measuring comparable things share scales and timeframes, or visibly declare the difference. A global timeframe selector applies to everything it appears to control; partial application is a Critical.
- **Change context.** Deltas show direction, magnitude, and the comparison basis ("+4.2% vs prior 7d"), with color paired to a sign or arrow, never color alone (Category 4).
- **Freshness.** Live or periodically refreshed data shows its staleness ("as of 14:32" or a relative timestamp); silent staleness on financial data is a Critical.
- **Precision restraint.** Show the precision that supports the decision, not what the API returns: 7-decimal percentages and 12-digit raw values read as noise. Pick per-metric precision rules and centralize them in a formatter.
- **Numbers that should agree, agree.** Two widgets on one screen showing contradictory counts for the same concept (a headline "0 plays" beside a card claiming "2 tries") is a Critical trust failure: either one value is a bug, or they measure different things and at least one needs renaming until the contradiction disappears.

## Live-updating data

- **No jitter.** Updating values use `tabular-nums` and fixed-width containers so the layout never breathes with each tick.
- **Change flashes are brief and subtle** (a 300-500ms background pulse), throttled so high-frequency feeds do not strobe; respect reduced motion.
- **Insertions do not steal the scroll.** New rows arriving in a feed never yank the user's scroll position; pin new content behind a "N new items" affordance when the user has scrolled.
- **Update cadence is throttled to human speed.** Re-rendering 20 times per second burns CPU (Category 13) and communicates nothing; batch to 1-2 visible updates per second.
