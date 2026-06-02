---
name: gog-google-workspace
description: Use gogcli for Google Workspace file operations across Drive, Docs, Sheets, Slides, Forms, and Sites.
---

# gog Google Workspace Skill

Use `gog` 0.17.x for Google Workspace file operations. The user OAuth token is
authorized for Drive, Docs, Sheets, Slides, Forms, and Sites. For Sheets, prefer
these patterns:

```bash
gog auth list --json
gog sheets get <spreadsheetId> '<tab-or-range>' --json
gog sheets update <spreadsheetId> '<range>' --values-json '<json-array>' --json
gog sheets append <spreadsheetId> '<range>' --values-json '<json-array>' --json
```

Rules:

- Prefer `--json` whenever the command supports it.
- For non-Sheets files, use the matching command group (`gog drive`,
  `gog docs`, `gog slides`, `gog forms`, or `gog sites`) when available.
- For existing spreadsheets, read the target range before writing.
- Confirm the file id, operation target, and exact values/change before every
  write, delete, share, publish, or bulk operation.
- Keep write ranges and file operations narrow and avoid whole-file/bulk
  operations unless explicitly requested.
- Do not expose OAuth token paths, refresh tokens, keyring passwords, or account
  secrets.
