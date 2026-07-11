# Example Project Profile: Children's Learning App (Ages 4 to 9)

This file does two jobs. It is a working profile for any touch-first kids learning app, and it is the template for writing your own profiles: copy it to `references/profile-<name>.md`, replace the rules with your project's own, and register it in the Project profiles section of SKILL.md with detection cues. Profile rules OVERRIDE the universal defaults in the other reference files; everything not mentioned here keeps its universal rule.

Detection (adapt to your project): file names or content referencing the app, its design tokens, kids reading/typing/learning features, or the user saying so.

Source of truth: when the repo is available, read `tailwind.config.*`, theme/token files, and any design-system docs before auditing. A profile describes the patterns; the config holds the exact values. If they conflict, the config wins and the conflict is itself a finding. Localization: if the app ships localized copy, the Category 14 localization checks apply at Warning severity minimum, using the longest target language as the stress test.

## Overrides: motor control and touch (replaces universal floors)

- **Touch targets: 56-64px minimum for primary game/learning actions, 48px floor for everything else.** A 44px target satisfies adult guidelines but not a 5-year-old's motor accuracy. Letter tiles, answer buttons, and navigation a child operates: 64px preferred. Violations here are Critical, not Warning.
- **Gaps between targets: 12-16px minimum.** Children mis-tap adjacent targets at 8px gaps.
- **Press feedback is mandatory on everything tappable.** Children re-tap when nothing visibly happens, causing double-fires. Use a clearly physical press (translate plus shadow shift, or a scale-down) and pair it with double-fire protection on game actions.
- **Game surfaces:** `touch-action: manipulation`, `select-none`, and suppressed long-press callouts so rapid or held taps never trigger zoom, selection, or context menus.

## Overrides: typography and reading (replaces universal floors)

- **Body text 18px minimum (`text-lg`); reading content 20-24px (`text-xl`/`text-2xl`); learner-facing display text larger still.** Early readers need large, well-spaced letterforms.
- **Line height `leading-relaxed` (1.625) minimum for reading content**, looser for beginner passages. Slightly increased tracking on early-reader body text aids letter discrimination.
- **Typeface rules:** rounded or geometric sans with unambiguous letterforms; check the a/g forms (single-storey preferred for beginners) and that I/l/1 are distinguishable. Strong weights (700-900) for headings and CTAs; never thin/hairline weights.
- **Reading-content casing:** lowercase-first presentation where the curriculum expects it; never style learning text in all-caps, which removes the word shapes beginners rely on.

## Overrides: color and contrast

- **Aim for 7:1 body-text contrast (WCAG AAA), not 4.5:1.** Children's contrast sensitivity and the cheap tablets they use both argue for the higher bar. 4.5:1 passes universally but is a Warning here.
- **Color never carries meaning alone, ever.** Correct/incorrect feedback always pairs color with icon + motion + (optionally) sound. Severity: Critical.

## Aesthetic enforcement (EXAMPLE: replace with your design system)

This section shows how a profile locks an aesthetic; the example system is neobrutalism-lite. Swap these rules for your own design system's, keeping the same level of specificity. Flag violations as Warning (aesthetic drift) unless they also break a universal rule.

- **Shadows: hard offsets, never blurs.** Pattern: `shadow-[4px_4px_0_0_#000]`. No `shadow-md`/`shadow-lg` Material blurs. One consistent shadow direction across the whole surface.
- **Borders: solid, 2-4px, black or near-black.** No 1px hairlines; dashed only when it communicates something.
- **Radius: modest and locked.** `rounded-md`/`rounded-lg` for surfaces, `rounded-xl` for large cards/buttons needing softness; `rounded-2xl`+ only for chips and pills; never `rounded-full` on rectangles.
- **Solid fills only.** No gradients on surfaces, no glassmorphism, no `backdrop-blur`, no semi-transparent panels over busy backgrounds.
- **Palette: bold saturated solids, one or two accents, on clean grounds.** A pastel-only or beige-only drift is the wrong aesthetic for this system, as is the AI-purple gradient look.
- **Press feedback is physical** (translate + shadow collapse), not a fade.
- **Iconography: solid or thick-stroke icons** matching the border weight; no delicate 1px line icons.

## Kids-specific conduct rules (Blockers)

- **No autoplay audio.** Sound is user-initiated or follows an explicit interaction; a global mute is reachable from every screen. Surprise audio in a kids app is a Blocker.
- **No dark patterns whatsoever:** no countdown pressure, no streak-shaming, no "are you sure you want to stop playing?" guilt prompts. Encouragement only.
- **Failure states never punish.** Wrong answers get neutral-to-warm feedback and an immediate retry path; no harsh buzzers, no red full-screen flashes.
- **Reward animations are short and skippable** (1-2s, tap to skip) so they celebrate without training impatience or hijacking the session.
- **Any external link, purchase, or settings surface sits behind a parent gate**, visually separated from the child UI.
- **Reduced-motion compliance is strict:** vestibular-triggering motion (parallax, large zooms, screen shake) is avoided entirely, not just behind the media query; gentle motion remains.

## Expo/React Native notes (if the project uses RN)

- On native screens, Tailwind web utilities translate via the project's styling layer (e.g. NativeWind); verify the press-feedback and shadow patterns have native equivalents (elevation/shadow props differ on Android/iOS).
- Safe areas via the safe-area context on every screen with bottom-anchored controls.
- Touch targets use `hitSlop` only as a patch; prefer sizing the pressable itself so the visual matches the target.

## Simulation persona (overrides the generic target user in `references/user-simulation.md`)

When you run the simulate-the-user-first pass for a kids learning app, the target user is **a 4-to-9-year-old who was just handed the phone**: distracted, not yet a fluent reader, tapping imprecisely, with no patience for instructions they cannot read. Walk the learning flow as that child — can they tell what to tap *without reading*? does a mis-tap punish them? does anything important rely on text they cannot decode? For parent-facing surfaces (settings, account, the parent gate), the user is **a parent on a phone, one-handed, in a 30-second window between tasks**. A screen that serves both gets both walks.

## The recurring squeeze failure — check FIRST on any text-next-to-control row

The universal "fixed-width sibling starves a text column" bug (Category 2, Layout) is a relentless repeat offender in kids-app cards and rows, so check it first on every card or row that places text beside a button, toggle, icon group, or badge. Two seen failure modes: an unbreakable token (an email, URL, or id) wrapping mid-value (`first.last@example.` / `com`); and — the one waved off as "it just wraps" — a full-sentence description collapsing into a one-word-per-line ribbon ("Stop / further / collection / of / data"). It is not fine; it looks broken. The fix is WIDTH: give the text its own full-width row and move the control onto a row below. Verify at 320px with realistic long content (a 40+ character email, a full-sentence label, a 20-character name) and LOOK; never clear it by reasoning. Treat as Critical here, not Warning — a known repeat offender on this kind of screen.

## Mascot / character bounding-box standard (if the app uses illustrated characters)

Kids apps lean on illustrated mascots, and they look broken the moment two render side by side at different sizes or with floating limbs. If the project draws characters as SVG, hold every character to one shared invisible bounding box. Example standard for a `0 0 100 100` viewBox:

- **Vertical:** topmost element at `y ≥ 8`, bottommost at `y ≤ 92`; total height ~80 (give or take 4).
- **Horizontal:** leftmost at `x ≥ 4`, rightmost at `x ≤ 96`; centred on `x = 50`.
- **Body mass:** roughly `60 × 60` centred near `(50, 54)`; main head/body ellipse about `rx ≈ 30, ry ≈ 30`.
- **No floating appendage:** ears, horns, antennae, or tails must overlap the body silhouette by ≥ 2px at their base. Confirm `appendage_base_y > body_cy − body_ry × √(1 − ((x − body_cx) / body_rx)²)`; if the value under the root is negative, that `x` is outside the body and the appendage will float.
- **z-order:** draw ear-like appendages BEFORE the head so the head covers their bases; decorative extras (sparkles, tails behind the body) follow the same draw-behind-first rule.

Before merging a new or revised character, compute `total_height = bottommost_y − topmost_y` and reject if it falls outside `[74, 82]`, or if `topmost_y < 6` or `bottommost_y > 92`. Don'ts: sharp triangle ears (use rounded tilted ellipses or rounded-tip paths); pointy fang teeth (use small ellipses); lines or stripes extending past the body silhouette (clip to the body ellipse); side-profile characters showing only one eye unless the silhouette is unambiguously single-sided.
