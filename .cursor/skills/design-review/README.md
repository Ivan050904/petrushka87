# Design Review (SuperDesigner / DesignReview)

Project skill for intent-based design review — PRD coverage, five states, flows, gaps before handoff.

## Source

- Marketing site: https://github.com/sherizan/superdesigner-ai
- Plugin source: https://github.com/sherizan/designagent-review (v0.1.0)
- Marketplace: https://github.com/sherizan/designagent

`superdesigner-ai` is the landing site; the review logic lives in `designagent-review`.

## How to use in Cursor

Ask the agent, for example:

- `Run a design review for the articles page`
- `Gap audit: what states are missing in therapy-sessions flow?`
- `Review this PRD against the UI — pre-handoff intent`

The agent loads `SKILL.md`, specialist agents in `agents/`, and templates in `templates/`.

## Optional: Figma bridge

Full Figma read/annotate needs the DesignAgent plugin (`designagent@designagent`). Without it, review still works from code, screenshots, and `context/*.md` files using the templates.

## Project layout (optional)

Scaffold per feature:

```
projects/<slug>/
  context/
    prd.md
    research.md
    figma.md
    analytics.md
    content.md
    DESIGN.md
  insights/
  memory/
```

Use `templates/` as stubs when creating new review projects.
