# Category 14: Generic-AI Aesthetic and Content Quality

This category answers one question: would a design-literate person glance at this and think "AI made it"? The tells below are not crimes individually; flag them when they appear as unconsidered defaults rather than justified choices. If the brief explicitly asks for one of these looks, it is a choice, not a tell.

## The default looks (flag when unjustified)

AI-generated design clusters around a few recognizable looks. Their appearance regardless of subject is what makes them tells:

- **AI-purple gradient glow.** Violet/indigo gradients, glowing purple CTAs, neon mesh blobs behind a centered dark hero. The single most recognizable tell.
- **Warm-cream editorial default.** Cream/bone background, high-contrast display serif, terracotta/brass accent. Legitimate for genuinely editorial or heritage brands; a default reach for every "premium" brief otherwise. The same palette on every premium project makes every brand invisible.
- **Dark-tech default.** Near-black page, one acid-green or vermilion accent, monospace eyebrows everywhere.
- **Broadsheet default.** Hairline rules, zero radius, dense newspaper columns, regardless of subject.

Also flag these structural defaults when they appear without justification:

- **Centered hero over gradient blob** with a big number + small label stat row. The template answer to every landing brief.
- **Three identical feature cards** (icon, heading, two lines) as the reflex for any "features" content.
- **Eyebrow label above every section** (small uppercase wide-tracked text). Cap roughly one per three sections.
- **Numbered markers (01/02/03)** on content that is not actually a sequence.
- **Glassmorphism everywhere**: backdrop-blur panels as the default surface treatment, with no `prefers-reduced-transparency` fallback.
- **Inter + slate-900 everything.** Inter is fine when neutrality is the point; as the unconsidered default for a brand that wanted personality, it is a tell. Same for reflex display serifs on every "creative" brief: emphasis inside a headline uses italic/bold of the same family, not a random serif word dropped into a sans headline.
- **Scattered infinite micro-animations** (pulsing badges, floating cards, endless gradient shifts) instead of one orchestrated moment.

## Fake content tells (these are Critical, not just aesthetic)

- **Div-built fake screenshots.** Product previews built from gray rectangles, fake dashboards, fake terminal windows. Use a real screenshot, a real working mini-component, real photography, or an honest labeled placeholder slot. Faked UI in a product context misleads.
- **Fake-precise numbers.** "92% faster", "4.1x", "13.4k users" invented for aesthetic credibility. Numbers come from real data, are clearly labeled as sample data, or do not appear.
- **Fake testimonials and logo walls.** Invented quotes with stock names, or text-styled brand names pretending to be logos. Real logos (e.g. Simple Icons for known brands), real quotes, or cut the section. Logo walls contain logos only, no category captions under each.
- **Lorem ipsum or placeholder strings** anywhere in something presented as finished.

## Dark patterns (universal, not just kids products)

Deceptive mechanics are Critical findings regardless of how polished they look: confirmshaming ("No thanks, I hate saving money"), pre-ticked consent or upsell boxes, hidden costs revealed at the final step, trick wording on destructive or subscription actions, countdown timers that reset, and cancellation paths dramatically harder than signup. Flag the mechanic and name the honest alternative.

## Copy and microcopy quality

Words are design material. Run a copy self-audit over every visible string: headlines, subheads, buttons, captions, empty states, errors, footer.

- **Buttons are verbs that name the outcome.** "Save changes", "Send message", "Start free trial"; not "Submit", "OK", "Click here". The label stays identical through the flow: a "Publish" button produces a "Published" confirmation.
- **One register per page.** Technical-mono data voice, editorial prose, and marketing punch do not mix in one composition unless the brand voice explicitly does this. Formal in one section and jokey in the next is drift.
- **Consistent terminology.** One name per concept app-wide: not "workspace" here and "project" there for the same thing. Interface vocabulary is wayfinding.
- **Specific beats clever.** Every string earns its place by helping the user understand or act. Flag: grammatically broken phrases, unclear referents, forced metaphors, mock-poetic filler ("crafted with intention", "elegantly simple"), and AI-flavored profundity. If unsure whether a sentence makes sense, replace it with a plain functional one; boring beats wrong.
- **CTA fit.** Primary CTA labels are 1-3 words and never wrap to a second line at desktop. A wrapped CTA means shorten the label or widen the button.
- **Errors and empty states direct, not emote.** What happened + how to fix it, in the interface's voice. No apologizing, no vagueness, no dead ends.
- **User vocabulary, not system vocabulary.** "Manage notifications", not "Configure webhook events". Name things by what users control and recognize.
- **Headline math.** Hero headline carries the value in ~2-8 words; the subtext earns ~20 more. If the value prop needs 60 words, the value prop is unclear, not the limit too tight.
- **Punctuation discipline.** Sentence case for UI labels (unless the design system says otherwise), real typographic quotes, and no em dashes used as a stylistic crutch in interface copy.

## Localization readiness (when the product ships in more than one language)

- **Text expansion budget.** Lithuanian, Russian, German, and Finnish strings can run up to 30-40% longer than English; buttons, tabs, and nav must survive a long-string test without wrapping, clipping, or breaking layout.
- **No text baked into images.** Real text rendered over assets so it can translate.
- **Locale-aware formats.** Dates, decimal separators, and currency come from one central formatter, not ad-hoc string building per component.
- **Hardcoded strings** move into the i18n layer once one exists (see durable-fixes).
- **RTL (only when an RTL locale is planned):** logical properties (`ms-*`, `me-*`, `padding-inline`) instead of left/right, and directional icons flip while symmetric ones stay.

## How to report this category

Lead with the pattern, not a style lecture: name the tell, why it reads as templated, and the specific replacement choice grounded in this product's subject and audience. "This is generic" is not a finding; "centered gradient hero + three icon cards is the template answer; for a children's reading app the hero should lead with the product itself (a live letter-tile interaction)" is.
