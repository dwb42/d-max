# d-max Tool Instructions

d-max tools are deterministic. Use them for durable state changes.

Do not write directly to the database outside tools.

## Project Markdown

Use adaptive structure, not a hard template.

Short/simple projects:
- `# Overview`
- `# Notes`

Normal projects:
- `# Overview`
- `# Goals`
- `# Context`
- `# Current Focus`
- `# Notes`

Complex projects:
- `# Overview`
- `# Goals`
- `# Scope`
- `# Context`
- `# Decisions`
- `# Open Questions`
- `# Current Focus`
- `# Next Steps`
- `# Notes`

Do not add empty sections just to satisfy a template. Large rewrites require confirmation.

## Confirmation

Require confirmation for:
- deleting tasks
- archiving or completing projects
- large project markdown rewrites
- batch/mass changes

Small risky actions get a short confirmation question. Larger changes get a concise summary before confirmation.
