# DMAX UI Screenshot Inventory

Phase 3 captured representative screenshots of the current DMAX UI for visual audit.

Capture date: 2026-05-14.

Capture method:

- API: `DATABASE_PATH=/tmp/dmax-ui-audit.sqlite npm run api`
- Web: `npm run web`
- Browser: system Google Chrome driven through the Chrome DevTools Protocol.
- Project Playwright/Puppeteer availability: not installed as project dependencies.
- Authentication: no app authentication required. Google Calendar was connected through existing local OAuth runtime data.
- Data source: copied local SQLite database at `/tmp/dmax-ui-audit.sqlite` for the capture pass.
- App source changes: none.

Screenshots are saved under `docs/ui/screenshots/current/`.

## Captured Screenshots

| Filename | Route/view | State captured | Density | Surface type | Phase 2 problems confirmed or tested | Sufficient for visual audit | Still useful to capture |
|---|---|---|---|---|---|---|---|
| `01-app-shell-categories.png` | `/categories` | Category overview with multiple populated categories | high | app shell, dashboard/list | list/layout inconsistency, copy mix, card density | yes | mobile/narrow version |
| `02-organizations-list.png` | `/organizations` | Organization list with always-visible create and search panels | low | list page | list/create/search inconsistency, form-first list | yes | list with many organizations |
| `03-organization-detail.png` | `/organizations/2` | Organization detail with description, contact point, address, relationships | medium | detail page | reference route candidate, relationship display, empty states | yes | detail with rich description and many relationships |
| `04-project-detail-dmax-drawer.png` | `/projects/1` | Project detail with contextual DMAX drawer open | high | drawer, detail page | drawer containment, detail compression, long text overload | yes | drawer on person/task after context fix validation |
| `05-people-list.png` | `/people` | Person list with always-visible create and search panels | low | list page | list/create/search inconsistency, form-first list | yes | list with many people |
| `06-person-detail.png` | `/people/1` | Person detail with permanent master-data form | medium | detail/editor | raw form-first person detail, relationship empties | yes | person with contact points and relationships |
| `07-projects-list.png` | `/projects` | Project collection grouped by category | high | list/structure page | project list density, always-visible create, card inconsistency | yes | relation-heavy project list |
| `08-project-detail.png` | `/projects/1` | Project detail with long markdown, media, participants | high | detail page | detail inconsistency, markdown overload, header action density | yes | lower scrolled relation panel |
| `09-tasks-list.png` | `/tasks` | Global task list | high | list page | task list lacks canonical toolbar/states, row action density | yes | empty task list and filters if added later |
| `10-task-detail.png` | `/tasks/1` | Task detail without media | medium | detail page | task metadata/notes/checklist ordering | partial | task with checklist, participants, due date |
| `11-category-detail.png` | `/categories/Reisen` | Category detail with initiatives grouped by type | medium | detail/list hybrid | category layout mismatch, relationship grouping | yes | category with description edit state |
| `12-calendar.png` | `/calendar?view=week&date=2026-05-14&allDay=1` | Week calendar with Google and initiative-span events | high | calendar/planning | time/event density, duplicated time concepts | yes | day view and empty calendar state |
| `13-planning-canvas.png` | `/planning-canvas` | Planning canvas with Google rows, project bars, dependencies | high | planning canvas | time/event duplication, custom relation display | yes | zoomed/detail interaction states |
| `14-config.png` | `/config` | Google Calendar account/source configuration | high | config/settings | technical density, metadata containment | yes | disconnected/unconfigured integration |
| `15-prompts.png` | `/prompts` | Prompt inspector with prompt list and turn timeline | high | debug utility | debug technical density, metadata pattern gap | yes | empty/error prompt inspector |
| `16-prompt-templates.png` | `/prompt-vorlagen` | Prompt template utility view | medium | utility/debug | utility page pattern need, mixed language | yes | expanded template row variants |
| `17-project-date-calendar-modal.png` | Project date modal on `/projects/1` | Project date and Google Calendar modal | medium | modal/editor | modal inconsistency, time/sync pattern gap | yes | bound/synced project state |
| `18-media-modal.png` | Media modal from `/tasks/35` | PDF viewer with metadata and analysis side panel | high | modal/inspector | metadata density, modal pattern, technical content | yes | image/audio/video media variants |
| `19-contact-point-modal.png` | Contact point modal on `/organizations/2` | Add contact point form | medium | modal/editor | modal/edit form consistency, contact point pattern | yes | edit existing contact point state |
| `20-address-modal.png` | Address modal on `/organizations/2` | Add address form | medium | modal/editor | address editor pattern, modal consistency | yes | edit existing address state |
| `21-google-event-dialog.png` | Google event dialog on `/calendar` | Read-only recurring Google event modal | medium | modal/calendar | Google event metadata overload, modal action hierarchy | partial | editable/linking Google event mode |
| `22-timeline.png` | `/calendar/timeline` | Project timeline grouped by category | medium | timeline | time surface duplication, truncation | yes | dense month/range alternatives |
| `23-ideas-list.png` | `/ideas` | Idea collection list | medium | list page | initiative subtype list pattern | yes | category-filtered state |
| `24-habits-list.png` | `/habits` | Habit collection list | low | list page | initiative subtype list pattern, empty sections | yes | populated habit list |
| `25-person-contact-point-modal.png` | Contact point modal on `/people/1` | Add contact point form for person | medium | modal/editor | contact point reuse across parties | yes | person with existing contact points |
| `26-organization-detail-agent-error.png` | `/organizations/2` DMAX button attempt | Error banner instead of opening contextual drawer | medium | detail/error state | contextual drawer bug, error copy/state | yes | working organization drawer after fix |
| `27-drive-mode.png` | `/drive` | Drive Mode ready/no-session state | medium | utility/voice | realtime utility surface, state/action hierarchy | yes | active session and failed session states |

## Missing Or Insufficient Screenshots

- True DMAX drawer on `/organizations/:id`: blocked by `contextEntityId is required for organization conversations`; see `26-organization-detail-agent-error.png`.
- Editable/linking variant of `GoogleEventDialog`: captured event is read-only recurring Google Calendar data.
- Relationship management modal/drawer beyond the inline organization member add row.
- Project/initiative lower-page relationship panel after scrolling.
- Task detail with checklist items, due date, participants and media all present together.
- Person detail with real contact points, organization links, participations and relationships.
- Organization detail with rich description, multiple members and multiple relationships.
- Empty whole-route examples for major lists; current local data is populated.
- Loading states, save failures, fetch failures and retry states; not safely triggerable without code or network manipulation.
- Disconnected/unconfigured Google Calendar state; local OAuth data is connected.
- Mobile, tablet and narrow desktop screenshots.
- Keyboard focus and hover states.

## Capture Notes

- Screenshots are desktop viewport only: 1440 x 1100.
- The capture did not modify application source code.
- The capture intentionally used a temporary SQLite copy for the final screenshot pass. The running frontend still performs normal status/prewarm requests, but the evidence pass did not write to the repository database.
- No final design decisions are made in this file. This inventory only records the visual evidence available for Phase 3.
