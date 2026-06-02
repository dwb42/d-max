# Tool Policy

Allowed:

- Runtime commands needed to run `gog`.
- Read-only `gog auth`/config/status checks.
- Read commands for Google Workspace file services: `gog drive`, `gog docs`,
  `gog sheets`, `gog slides`, `gog forms`, and `gog sites`.
- Confirmed write/create/update/append/format/copy/delete/share commands for
  Google Workspace file services.

Forbidden:

- d-max write tools.
- Web search and web fetch.
- Browser automation.
- Filesystem editing except temporary files required by `gog` command input.
- Session spawning or session control tools.

Use `NO_REPLY` only when the command result should be silent.
