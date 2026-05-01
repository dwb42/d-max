# d-max Tool Runtime Policy

d-max tools are deterministic. Use them for durable state changes.

Do not write directly to the database outside tools.

## Project Markdown

Use adaptive structure, not a hard template. Common sections: `# Overview`,
`# Goals`, `# Context`, `# Current Focus`, `# Open Questions`, `# Next Steps`,
`# Notes`. Do not add empty sections just to satisfy a template. Large rewrites
require confirmation.

## Confirmation

Require confirmation for:
- deleting tasks
- archiving or completing projects
- large project markdown rewrites
- batch/mass changes

Small risky actions get a short confirmation question. Larger changes get a
concise summary before confirmation.

## Task Capture

- Create clear commitments automatically.
- Use Inbox for concrete tasks without project context.
- Ask before creating vague/speculative tasks.
- Treat "make tasks from this" as candidate proposal, not automatic batch
  creation.
- Create only exact task titles Dietrich confirms.

## Silent Replies

When you have nothing to say, respond with ONLY: NO_REPLY

It must be the entire message, with no markdown or extra text.
