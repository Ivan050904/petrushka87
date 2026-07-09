# Folio-One Design System v2

Source: June 2026 IA redesign (variant A) — capture-first personal operations.

## Product posture

Folio-One is a daily command center for personal life operations. The morning screen should answer "what matters today" in one glance. Capture happens anywhere with one field; deep editing is on demand, not by default.

## Information architecture

Navigation follows user scenarios, not raw Entry types:

| Tier | Sections | Purpose |
| --- | --- | --- |
| 1 — Daily | Сегодня, Входящие | Agenda, capture, triage |
| 2 — Content | Журнал, Планы, Трекинг | Writing, time-bound items, habits/money/food |
| 3 — Reference | Справочник | People and files |
| Global | Поиск | Find anything by text or type |

Entry types remain in the data model; they surface as filters, badges, and inspector fields — not as top-level navigation.

## Interface principles

- Prefer dense but calm layouts for repeated desktop use.
- Fit the main daily workflow into one laptop viewport when data volume allows it.
- Keep universal quick capture visible on Сегодня; type selection is secondary (overflow, not default chips).
- Keep notifications behind a dedicated bell button.
- Use Lucide icons for navigation and actions; module identity is icon + label, not per-module hue.
- Avoid decorative backgrounds, blobs, oversized hero treatments, nested cards, and long explanatory copy.
- Hide service-level data such as raw JSON behind progressive disclosure.
- Cards are for bounded tools, repeated items, and forms only.

## Capture rule

- Default mode is `auto` — one textarea, no type chips visible.
- Explicit type selection lives in an overflow control ("Указать тип").
- After AI or manual parse, show a short preview with at most two surface signals.

## Surface rule

In lists, timelines, and previews show at most **two signals** per row: what it is + when it matters. Status, priority, tags, and relations belong in the inspector panel.

## Palette — brand blue

Semantic tokens in `frontend/src/app/globals.css`, aligned with the Folio-One logo (`#2563EB` family):

- Background: cool blue-white (`214 100% 97%`) — not neutral gray
- Surface: white card
- Primary: vibrant brand blue (`217 91% 53%`) — one main CTA per viewport zone
- Primary foreground: white on filled primary buttons
- Secondary: soft blue tint for counters and low-emphasis badges
- Accent: green for done / progress
- Destructive: red for deletion and errors
- Borders: low-contrast blue-gray

Brand assets live in `frontend/public/brand/` (`logo-mark`, `logo-wordmark`, `logo-square`). Favicon via `app/icon.png`.

Do not assign a unique accent color per navigation module.

## Color semantics

| Token | Use |
| --- | --- |
| Primary | Single primary action in a zone |
| Secondary | Neutral metadata badges, counts |
| Accent | Completed, constructive status |
| Destructive | Delete, errors |
| Muted | Secondary text, backgrounds |

Selected filters use `border-primary/50 bg-primary/12 text-primary`, not full primary fill.

## Typography

- Body: Inter via `next/font/google`, then Segoe UI / Arial fallback.
- Mono: system monospace for numeric totals only.
- Do not scale type with viewport width.
- Page titles: ~24px; card titles: ~16px; body in dense panels: 14–16px.

## Component rules

- Forms use visible labels and inline errors.
- Icon-only controls require `aria-label`.
- Buttons and inputs use stable dimensions to avoid layout shift.
- Lists prioritize scanning over decorative presentation.
- Raw metadata editing stays collapsed by default.
- Empty states are short and action-oriented.
- Keep hover, focus, selected, disabled, and loading states visible in light mode.
- Maximum two badges per list row.
