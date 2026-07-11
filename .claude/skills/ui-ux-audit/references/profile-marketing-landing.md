# Project Profile: Marketing / Landing Pages

Conversion-focused public pages: home, product, pricing, campaign and feature landings. These exist to make a stranger understand a value and take ONE action. The reader is unconverted, impatient, often arriving on mobile from an ad. When this profile applies, the rules below OVERRIDE the universal defaults; everything not mentioned here keeps its universal rule. This profile is category-neutral about industry: for an actual storefront/checkout flow, switch to the e-commerce profile; for an app's internal UI, switch to that app's profile.

Detection: landing/home/product/pricing/campaign routes, hero sections, marketing or sales copy, conversion CTAs and lead-capture/newsletter forms, "above the fold", "convert", "bounce rate", or the user saying so.

Source of truth: the page has a single conversion goal — find it before auditing (the primary CTA, the form submit, the "what does this page want the visitor to do"). Audit every element by whether it advances that goal or distracts from it. If the goal is unclear from the page itself, that ambiguity is the first finding.

## Overrides: one value proposition, one primary CTA

- **The above-the-fold must answer "what is this and why should I care" in one glance, then offer ONE primary action.** A hero with a clear headline, a sub that earns ~20 more words, and one dominant CTA. Severity for a missing/buried value prop or an invisible primary CTA: Critical.
- **Competing primary CTAs dilute conversion.** Two equally weighted buttons ("Start free trial" AND "Book a demo" at identical emphasis) split intent. Pick one primary; demote the rest to secondary/ghost styling. Duplicate primary CTA intent: Warning (Critical if the page has three-plus equal CTAs above the fold).
- **CTA repetition down the page is good, not drift** — the same labelled action repeated at section breaks is expected and not a consistency finding. What IS a finding: the repeated CTA using different labels for the same action ("Get started" / "Sign up" / "Try it now" all pointing at the same place). One label per action.

## Overrides: social proof must be real (ties to Category 14)

- **Fabricated testimonials, fake logo walls, and invented precise stats are Critical here, not merely an aesthetic tell.** A marketing page's entire job is trust; faked trust signals are the worst possible failure on the highest-stakes surface. Specifically Critical: invented quotes with stock names/headshots, text-styled brand names posing as customer logos, and fake-precise numbers ("trusted by 12,400 teams", "3.2x faster") with no real source.
- **Real logos only, logos only.** A logo wall contains actual brand marks the company can prove a relationship with — no category captions under each, no filler logos to pad the row.
- **Stats come from real data, are labelled as sample/illustrative, or do not appear.** An unlabelled precise number on a marketing page reads as a claim and is treated as one.

## Overrides: performance is a conversion KPI, not a nicety

- **A heavy unoptimised hero image/video or layout shift on load is Critical here, not Warning.** Slow LCP and visible CLS directly cost conversions and Core Web Vitals (an SEO ranking input), so they escalate one full level above their universal severity on this page type.
- **Hero media is the LCP element — treat it as the most expensive thing on the page.** Flag: multi-MB unoptimised hero (no responsive `srcset`/`sizes`, no modern format, no compression), autoplaying background video with no poster, render-blocking fonts/scripts ahead of the hero. Provide the budget in the fix (e.g. hero under ~200KB, LCP under 2.5s, CLS under 0.1).
- **Unsized hero/media that shifts the headline or CTA on load: Critical.** The CTA jumping under a visitor's cursor as the page settles is a conversion leak.
- **Above-the-fold must be usable before the whole page loads** — the headline and CTA render and are clickable without waiting on below-fold assets.

## Overrides: copy is conversion (Category 14 applies in full, plus)

- **Specific, benefit-led copy beats vague hype.** "Cut invoice approval from 3 days to 3 hours" beats "Streamline your workflow". Flag mock-profound filler ("crafted with intention", "elegantly simple", "the future of X"), unfalsifiable superlatives, and feature-listing where a benefit is what converts.
- **Headline carries the value in ~2-8 words; the sub earns ~20 more.** If the value needs a paragraph, the value prop is unclear. Vague/clever-over-clear hero headline: Warning.
- **Primary CTA labels name the outcome and never wrap at desktop.** "Start free trial", "Get the template" — not "Submit", "Learn more" on the primary action.

## Overrides: conversion dark patterns are Blockers

These deceptive mechanics raise legal exposure (FTC, EU) and torch trust; on a conversion surface they are Blockers, not Critical:

- **Forced continuity / sneaking:** free trial that silently bills with no clear price, term, or cancellation path stated before sign-up; pre-ticked upsell or consent boxes; items/add-ons slipped into the flow.
- **Confirmshaming:** decline links that shame ("No thanks, I don't want to grow my business").
- **Fake urgency:** countdown timers that reset on reload, "only 2 left" with no real inventory, "23 people viewing" fabricated activity, perpetual "sale ends today".
- **Hidden cost / drip pricing:** the real price only appearing at the final step.
Flag the mechanic by name and state the honest alternative.

## Overrides: lead-capture and signup forms minimise friction

(Universal form rules from Category 6 still apply; these tighten them for conversion.)

- **Only fields that are genuinely necessary to convert.** Every extra field drops completion. A newsletter capture asking for name + company + phone when it needs only an email is a friction finding (Warning; Critical if it gates the page's sole conversion goal).
- **Visible labels, never placeholder-as-label** (Critical, as universal) — doubly enforced because marketing forms are the most frequent offenders.
- **Inline validation on blur, errors in text below the field**, success state on submit; never a silent or dead-end submit. A form with no error/success state on the page's primary conversion action: Critical.
- **The submit button names the reward, not the chore:** "Get my free guide", not "Submit".

## Reminders (universal rules that marketing pages routinely fail — same severity, just commonly missed)

- **Accessibility applies in full.** Marketing pages habitually ship decorative-only contrast, image-only text in heroes, keyboard-untraversable nav/menus, and missing alt text. Hold them to the universal a11y bar; do not relax it because the page is "just marketing".
- **Mobile-first / responsive is load-bearing** — a large share of marketing traffic is mobile. Verify the hero, headline, and primary CTA at 360px: no horizontal scroll, CTA reachable without scrolling past distractions, no two-line nav. A hero broken or CTA pushed off-screen at 360px is Critical (common-viewport break).
- **The generic-AI aesthetic is endemic here — apply Category 14 hard.** Centered hero over a purple gradient blob, three identical feature cards, an eyebrow label above every section, a stock-y hero photo, scattered infinite micro-animations: on a brand's flagship surface these make the brand invisible. Flag per Category 14 and ground the replacement in this product's actual subject and audience, not a style lecture.
