# Session Handoff: OpenClaw 2026.5.12 Two-Container Plan - 2026-05-16

## Reset Summary

This session completed the OpenClaw 2026.5.12 staging diagnosis and produced
the next architecture plan for DMAX. Production was not modified, and the
existing production-like container was not touched or restarted.

The practical result:

- Path 2 is the working integration path for OpenClaw 2026.5.12.
- DMAX tools are exposed to the Codex harness through the reversible
  `dmax-dynamic-tools` bridge as `d-max__...` dynamic tools.
- The normal DMAX default agent is thin: only DMAX tools, no native web/browser/
  canvas/media/TTS/sandbox/research/memory/plugin-sprawl tools.
- Research/web is separated into a `dmax-research` agent.
- Codex auth must be OpenClaw-managed inside the active `OPENCLAW_STATE_DIR`.
- No OpenClaw dist/runtime patch is needed for default-tool suppression; use
  plugin and agent allowlists plus tests.
- The next target architecture is two containers, not a broad microservice
  split:
  - `dmax-api`
  - `dmax-openclaw`
- Final target state: `dmax-openclaw` does not mount or open SQLite. Its
  `dmax-dynamic-tools` plugin calls an authenticated internal tool endpoint on
  `dmax-api`, and `dmax-api` remains the only SQLite owner.

## Files Added Or Updated

Primary plan:

- `docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PLAN.md`

Primary measurement/report handoff:

- `docs/archive/session-handoffs/session-handoff-openclaw-512-dmax-dynamic-tools-staging-2026-05-16.md`

Supporting staging handoffs:

- `docs/archive/session-handoffs/session-handoff-openclaw-512-staging-2026-05-16.md`
- `docs/archive/session-handoffs/session-handoff-openclaw-512-dmax-mcp-staging-2026-05-16.md`

Staging bridge files:

- `openclaw/plugins/dmax-dynamic-tools/package.json`
- `openclaw/plugins/dmax-dynamic-tools/openclaw.plugin.json`
- `openclaw/plugins/dmax-dynamic-tools/index.mjs`
- `tests/openclaw/dmax-dynamic-tools-plugin.test.ts`

Dockerfile note:

- The Dockerfile currently has the intended reversible build arg:
  `ARG OPENCLAW_VERSION=2026.4.26`
- It installs `openclaw@${OPENCLAW_VERSION}`.
- Keep the production default at `2026.4.26` unless a later fresh-container
  verification explicitly changes it.

## Completed Validation

Focused tests passed:

```sh
npm run test -- tests/openclaw/config-web-tools.test.ts tests/openclaw/dmax-dynamic-tools-plugin.test.ts
```

Result:

- 2 test files passed
- 3 tests passed

Staging OpenClaw/Codex result:

- OpenClaw version: `2026.5.12`
- Codex plugin: `@openclaw/codex@2026.5.12`
- Codex plugin loaded from active state dir:
  `/app/data/openclaw-web-state/npm/node_modules/@openclaw/codex/dist/index.js`
- Model/runtime route: `openai/gpt-5.5` with Codex runtime
- Default agent tool count: `47`
- Default agent tools: all `d-max__...`
- `d-max__listCategories` was called successfully in 6/6 warm tool runs.

Latency after staging Codex re-auth:

- OpenClaw ready: about `13.4s`
- DMAX API listening: about `13.7s`
- external `/health` poll: `6.678s`
- first successful warmup after reauth: `3.129s` API wall
- warm simple turns, 8 runs:
  - total P50/P95: `2708ms` / `3380ms`
  - OpenClaw overhead excluding model time P50/P95: `980ms` / `1239ms`
- warm DMAX tool-call turns, 6 runs:
  - total P50/P95: `5210ms` / `6796ms`
  - OpenClaw overhead excluding model time P50/P95: `988ms` / `1288ms`

Conclusion: warm OpenClaw overhead is within target after auth is correct. The
remaining work is architecture hardening and container split, not latency
debugging.

## Important Learnings

OpenClaw 2026.5.12:

- Is not a drop-in upgrade from the current production pin.
- Requires the official `@openclaw/codex` plugin installed in the active
  `OPENCLAW_STATE_DIR`.
- Uses `openai/gpt-5.5` for the 2026.5.12 Codex route, not the legacy
  `openai-codex/gpt-5.5` route.
- Needs valid OpenClaw-managed Codex OAuth in the active state dir.
- Old Codex CLI auth mounted at `/root/.codex` is not sufficient for this route.

Tool exposure:

- Native OpenClaw MCP-server exposure was not reliable enough in this staging
  session.
- The reproducible path is `dmax-dynamic-tools`.
- The bridge currently works by importing built DMAX code and opening SQLite in
  the OpenClaw process.
- The planned final state is better: the plugin becomes an HTTP adapter and
  calls `dmax-api`.

Default agent:

- Do not patch OpenClaw runtime/dist files to hide native tools.
- Configure `main.tools.allow` explicitly.
- Guard this with tests.
- Keep web/research separate in `dmax-research`.

## Next Goal To Run After Reset

Use the `/goal` prompt embedded in:

```text
docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PLAN.md
```

That goal instructs the next coding agent to:

1. Add an authenticated internal DMAX tool endpoint to `dmax-api`.
2. Convert `dmax-dynamic-tools` into an HTTP adapter.
3. Build a reversible two-container staging layout:
   - `dmax-api`
   - `dmax-openclaw`
4. Ensure `dmax-openclaw` has no direct SQLite access in final staging.
5. Install/load `@openclaw/codex@2026.5.12` from active OpenClaw state.
6. Keep the default agent thin and DMAX-only.
7. Measure startup, warmup, warm simple turns, and warm DMAX tool-call turns.
8. Produce a VPS promotion checklist only after staging passes.

## Target Latency Gates For Next Session

- `dmax-api /health < 10s`
- OpenClaw Gateway ready `< 20s` preferred, `< 30s` hard gate
- API + OpenClaw usable `< 30s` preferred, `< 45s` hard gate
- first synthetic OpenClaw warmup `< 10s`
- warm simple OpenClaw overhead excluding model time:
  - P50 `< 2s`
  - P95 `< 5s`
  - total wall P95 target `< 6s`
- warm DMAX tool-call OpenClaw overhead excluding model time:
  - P50 `< 2s`
  - P95 `< 5s`
  - total wall P95 target `< 8s`
- no recurring 8-10s warm OpenClaw overhead
- no 20-50s pre-model stalls

## Safety Constraints For Next Session

- Do not modify production first.
- Do not touch or restart `d-max-d-max-1` unless explicitly instructed.
- Do not expose secrets, OAuth tokens, device codes, or account identifiers.
- Do not copy Codex/OAuth state into the repo or image.
- Keep all staging containers, volumes, and temp dirs uniquely named.
- Keep changes reversible.
- Do not patch OpenClaw dist files.

## Current Working Tree Reminder

At handoff time, relevant uncommitted/untracked changes include:

- Modified `Dockerfile`
- New `docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PLAN.md`
- New/updated OpenClaw 2026.5.12 staging handoff docs
- New `openclaw/plugins/dmax-dynamic-tools/`
- New `tests/openclaw/dmax-dynamic-tools-plugin.test.ts`

These are intentional staging/planning artifacts unless a later review decides
to discard or squash them.
