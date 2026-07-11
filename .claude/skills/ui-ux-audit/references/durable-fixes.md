# Durable Fixes: Stop Bugs From Coming Back

A finding fixed by hand returns the next time code is generated. A finding fixed by tooling stays fixed. In every full audit, end with the 1-4 tools that would prevent the largest failure families found. Phrase recommendations so a non-coder can act on them: each entry includes the exact instruction to give an AI assistant.

Many people using this skill direct AI tools rather than writing code by hand, so never dump raw config at them as a task; offer to set it up, or give the one-line instruction they can paste into their coding assistant.

## Failure family to tooling map

| Failure family (categories) | Tool | Instruction to give the AI |
|---|---|---|
| Duplicate/conflicting/off-scale Tailwind classes (2, 10) | eslint-plugin-tailwindcss + prettier-plugin-tailwindcss | "Install and configure eslint-plugin-tailwindcss with no-contradicting-classname and enforces-shorthand enabled, and prettier-plugin-tailwindcss for class ordering. Make lint run before every commit." |
| Accessibility violations in JSX: missing alt, labels, roles, click-on-div (5, 6, 9) | eslint-plugin-jsx-a11y (strict) | "Add eslint-plugin-jsx-a11y with the strict config and fix everything it reports." |
| Runtime accessibility: contrast, names, focus order (4, 9) | axe-core via @axe-core/playwright (or Lighthouse a11y) | "Add an automated accessibility test that runs axe-core against every main screen and fails the build on violations." |
| Visual drift and regressions: spacing, layout breaks at 360px, component drift (2, 8, 10) | Playwright screenshot tests | "Set up Playwright visual regression tests: screenshot each main screen at 360px, 768px, and 1280px and fail when pixels change unexpectedly." (Anthropic's webapp-testing skill covers this workflow.) |
| Performance regressions: layout shift, slow load, oversized images (13) | Lighthouse CI + web-vitals | "Add Lighthouse CI with budgets: CLS under 0.1, LCP under 2.5s, and fail the build when exceeded." |
| Token drift: raw hex values, magic numbers in components (10) | Centralized theme + lint guard | "Move every color, radius, and shadow into the Tailwind config (or CSS variables at :root), then add a lint rule or grep check that fails on raw hex values inside components." |
| Hardcoded user-facing strings when i18n exists (14) | i18n lint (e.g. eslint-plugin-i18next) | "Add a lint rule that flags hardcoded user-visible strings in components so all copy goes through the translation files." |
| Inconsistent number/date formatting across views (15) | Central formatter module (Intl.NumberFormat / Intl.DateTimeFormat wrappers) | "Create one formatting module for all numbers, dates, and currencies, and replace every inline toFixed or manual string with it." |
| Type-level prop misuse, missing required props (5, 10) | TypeScript strict mode | "Turn on TypeScript strict mode and fix the errors; it catches missing/wrong props before they render." |
| Broken interaction flows: forms, modals, keyboard paths (5, 6, 9) | Playwright functional tests | "Write Playwright tests for the critical flows: submit each form with valid and invalid data, open and close each modal with mouse and keyboard." |

## Rules for recommending

- **One recommendation per failure family**, attached to the report's Durable fixes section, not repeated under every finding.
- **Proportionality.** A one-page prototype does not need the full battery; recommend the single highest-leverage tool. A pre-launch product (app store submission, paying users) justifies the visual-regression + a11y + Lighthouse trio.
- **Order by leverage.** Recommend first whatever prevents the family with the most findings in this audit.
- **Never recommend a tool you have not matched to the stack.** RN/Expo native screens use different tooling than web (e.g. jest + react-native-testing-library, Maestro for flows); say so rather than prescribing web tools that will not run there. Expo web targets can use the web tooling above.
- **Close the loop.** When the same finding family appears in a second audit of the same project, escalate: the durable fix from last time was not installed, so installing it is now the top priority, above the individual fixes.
