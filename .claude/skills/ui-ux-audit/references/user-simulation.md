# Method: Simulate the user first, then scan

Read this on every full audit, and on quick reviews touching a flow rather than a single static element. The category checklist catches violations of known rules. It does NOT catch experiential failures: two state machines that contradict each other on one screen, a control labelled one scope that saves another, a flow that works on the happy path and dead-ends on the empty state, a screen perfectly accessible at desktop and unusable at 360px. Those only surface when you walk the product as a person, not when you grep for `shadow-md`.

## The mandate: SIMULATE BEFORE YOU SCAN

Run the simulation FIRST. The fifteen-category checklist is the back-stop, not the front door. Pattern-matching the loud, well-known problems before tracing the experience is exactly how the experiential failures keep shipping. Every defect the simulation surfaces is still written up in the standard finding format (Found / Why / Fix / Prevent) and assigned one of the four severities — the simulation does not change how you report, it changes what you have findings about.

## Minimum personas — one trace each

Walk each persona as a separate pass. Narrate (in your reasoning) what they see, tap, expect, and where the product frustrates them. Do not summarise; walk the actual screens in order.

1. **The target user in their real context.** The product's actual primary user, doing the job the product exists for, under the conditions they really use it (rushed, one-handed, low attention, on the device they actually own). The specific persona is named by the active project profile — use it; do not invent a generic "user".
2. **A constrained user.** Pick at least one and commit to the full trace: keyboard-only (Tab order, focus visibility, no traps), screen-reader (announced name/role/state of each control, reading order), colour-blind (deuteranopia is the common case — is any signal carried by colour alone?), low-vision at 200% browser zoom (does the layout reflow or clip?), or motor-impaired with imprecise taps (target size, adjacent-target spacing, accidental fires).
3. **An edge-case-data user.** Pick the ones the screen can actually hit: empty first-visit state, far more items than the layout expects, very long content (long names, titles, emails, URLs, numbers), slow network with a mid-hydration paint, or a returning user with stale local state from a previous version.

## Trace, don't tap

For every screen the change touches, in the order the user reaches it, ask:

- **First seen vs most important.** What is the first thing they see? Is it the thing that matters most here?
- **First tapped vs obviously tappable.** What is the first thing they reach for? Is it obviously interactive, or does it only look tappable to someone who read the code?
- **Response matches expectation.** What does the product do in response? Does the result match what the action promised?
- **Fast / wrong / accidental input.** What happens on a double-tap, a mistaken tap, a tap during loading? Any double-fire, lost input, or irreversible action?
- **Back and undo.** Can they get back? Can they undo? Is the exit obvious?
- **Leave and return.** Leave mid-flow and come back — is state preserved when it should be, and cleared when it should be?
- **Changed elsewhere.** A value changed in another tab, device, or session — does this screen reconcile, or show a stale truth?

## Three-viewport check

Trace the screen at **360px** (smallest realistic mobile), **768px** (tablet portrait), and **1280px** (desktop). At each width, check:

- Horizontal scroll or content escaping its container.
- Any touch target below the floor (the universal 44px floor, or the stricter profile floor).
- Any text below the readability floor for this audience.
- Any load-bearing content `hidden` at that breakpoint — reorder, never hide what the user needs there.

Squeeze failures hide at the narrow end and clipping at the wide end; checking only one viewport misses both.

## State table — required per interactive component

For every interactive component the change touches, fill this in. A cell you did not verify reads "not checked" — never a guessed green.

| State | What the user sees | What they can do |
|---|---|---|
| Loading | | |
| Empty | | |
| Populated (typical) | | |
| Populated (edge: many items, long content) | | |
| Error | | |
| Disabled | | |
| Long-content overflow | | |

A missing state on a primary flow is a Critical finding; a missing state on a secondary one is a Warning. The empty and error rows are the ones AI most reliably omits — check them explicitly.

## Concurrency check

Real users keep two things open at once and act on stale views. Walk at least one multi-actor scenario per screen:

- Component A is mid-edit while component B opens a confirm/destructive modal — do they fight over focus, scroll lock, or the same data?
- A modal is open while another tab updates the same record — does the modal save over fresh data on close?
- A request is in flight and the user navigates away — orphaned write, late callback firing into an unmounted screen, or a toast for a screen they already left?
- A timer or animation runs while the page is backgrounded — does it keep ticking, double-fire on resume, or drift?

## The honesty rule

State plainly what the input could not confirm. Real screen-reader cadence, real touch latency, real motion-sickness response, and real network timing cannot be verified from static code or a screenshot — say "I did not verify X" rather than implying you did. A named gap is worth more than a fake green check, and it routes correctly: unverifiable risks go under **Verify in code** in the report (with the severity they become if they fail), not into a deduction. Score only what the input actually showed.

## Profile ties in here

The generic personas above are placeholders. The active project profile names the **specific** target-user persona to walk and any **stricter floors** that change severities — it may name the real primary user (their age, context, and device), raise the touch-target floor above the universal 44px, and lift the contrast bar above WCAG AA. Read the applicable profile before tracing, and let its persona and floors override these defaults. With no profile active, walk a sensible primary user for the product and hold the universal floors.
