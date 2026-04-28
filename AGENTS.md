# d-max Agent Instructions

## Project Goal

d-max is an agentic project and task memory system for Dietrich.

The system combines:
- OpenClaw as the agentic runtime
- Telegram as the user interface
- SQLite as deterministic data layer
- structured tools for categories, projects, and tasks
- project-level markdown memory stored in the database

## Core Concepts

Use these terms consistently:

- Project: any major initiative, goal, exploration, or workstream.
- Project hierarchy: use `projects.parent_id`, not a separate subprojects table.
- Category: dynamic life/business area such as Business, Family & Friends, Health & Fitness, Soul, Learning, Explorations.
- Task: deterministic actionable unit connected to a project.

## Data Model

MVP tables:
- categories
- projects
- tasks

Do not add project_events in the MVP.

The `projects` table must include a field called `markdown`.

## Architecture

Local development:

Telegram d-max-dev
→ local OpenClaw
→ d-max tools
→ local SQLite database

Production:

Telegram d-max
→ VPS OpenClaw
→ d-max tools
→ production SQLite database

## Engineering Rules

- Prefer simple, explicit TypeScript.
- Keep the deterministic data layer separate from agent prompts.
- The database is the source of truth.
- The agent may reason, summarize, and propose, but state changes must go through tools.
- Write small modules.
- Add scripts for setup, dev, and testing.
- Never commit secrets or .env files.
