# Media Attachments Plan

Date: 2026-05-11

Purpose: implementation notes and follow-up map for media attachments in d-max.
Attachment v1 was implemented on 2026-05-05 for initiative and task detail
pages. `docs/current-state.md` and code remain the source of truth for what
exists today.

## Goal

Dietrich should be able to add media alongside text at relevant places in the
app: images, audio, video, documents, and later derived text such as
transcripts, OCR, and summaries.

The design should preserve the existing d-max boundaries:

- SQLite remains the source of truth for metadata and relationships.
- Binary files are not stored in SQLite.
- Durable state changes go through API services or d-max tools.
- Browser chat and Telegram/app natural-language paths stay on OpenClaw plus
  tools.
- Context resolver synchronization is mandatory when schema/domain state
  changes.

## Architecture Decision

Introduce media as its own attachment domain. Do not encode media directly into
`initiatives.markdown`, `tasks.notes`, category descriptions, or app chat text.

Use:

- a central `media_assets` table for file metadata
- a central `media_links` table for relationships to d-max entities
- local file storage under a configured data directory for v1

This keeps one uploaded file reusable across several entities and keeps
Markdown/text fields focused on human-authored memory.

## Scope For Attachment v1

Status: implemented.

Implement the first complete slice for:

- initiative detail pages (`/initiatives/:id`)
- task detail pages (`/tasks/:id`)

Still outside first-class support:

- chat message uploads in the DMAX drawer
- media during create flows
- category-level and calendar-entry media in the browser UI
- calendar-entry and app-chat-message attachment validation in API/tools
- Telegram media ingestion
- realtime Drive Mode durable media commits
- background/job-based OCR/transcription/video processing

## Data Model

Add `media_assets`:

```sql
create table if not exists media_assets (
  id integer primary key,
  kind text not null check (kind in ('image', 'audio', 'video', 'document', 'other')),
  mime_type text not null,
  original_name text not null,
  storage_path text not null unique,
  sha256 text not null,
  byte_size integer not null,
  width integer,
  height integer,
  duration_ms integer,
  transcript text,
  text_excerpt text,
  summary text,
  created_at text not null,
  updated_at text not null
);
```

Add `media_links`:

```sql
create table if not exists media_links (
  id integer primary key,
  asset_id integer not null references media_assets(id) on delete cascade,
  entity_type text not null check (entity_type in ('category', 'initiative', 'task', 'calendar_entry', 'app_chat_message')),
  entity_id integer not null,
  caption text,
  role text,
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null,
  unique(asset_id, entity_type, entity_id)
);
```

Indexes:

```sql
create index if not exists idx_media_assets_kind on media_assets(kind);
create index if not exists idx_media_assets_sha256 on media_assets(sha256);
create index if not exists idx_media_links_entity on media_links(entity_type, entity_id, sort_order, id);
create index if not exists idx_media_links_asset_id on media_links(asset_id);
```

Resolved v1 decisions:

- `unique(asset_id, entity_type, entity_id)` prevents attaching the same asset
  twice to the same entity with different captions.
- Linked entity integrity is validated in repositories/API because
  `entity_type` is polymorphic.
- The schema reserves `calendar_entry` and `app_chat_message` entity types for
  later use. Current API/tool validation supports category, initiative, and
  task attachments only; browser upload UI supports initiative and task detail
  pages only.

## Storage

Env:

```text
DMAX_MEDIA_STORAGE_DIR=./data/media
DMAX_MEDIA_MAX_UPLOAD_BYTES=52428800
```

Store files under a hash-derived path, for example:

```text
data/media/assets/ab/abcdef.../original-normalized.ext
```

Rules:

- Do not commit `data/media/`.
- Normalize filenames for display and path safety.
- Store content hash and byte size.
- Prefer hash-based de-duplication where practical.
- Serve files only through API endpoints, not by exposing arbitrary filesystem
  paths.

Allowed MIME types for v1:

- images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- audio: `audio/webm`, `audio/mpeg`, `audio/mp4`, `audio/ogg`, `audio/wav`
- video: `video/mp4`, `video/webm`, `video/quicktime`
- documents: `application/pdf`, `text/plain`, Markdown, common Office formats
  if safe MIME detection is acceptable

## Repositories And Services

Implemented modules:

- `src/repositories/media-assets.ts`
- `src/repositories/media-links.ts`
- `src/media/media-storage.ts`
- `src/media/media-analysis.ts`

Repository responsibilities:

- create asset metadata
- find/list assets
- create/update/delete links
- list attachments by entity
- reorder links within entity
- validate linked entity exists for v1 supported types

Storage service responsibilities:

- read upload bytes with max-size guard
- derive hash
- choose storage path
- write file atomically
- map MIME type to media kind
- return safe public/API URL metadata

## API

Implemented endpoints:

```text
GET    /api/media/assets/:id
PATCH  /api/media/assets/:id
POST   /api/media/assets/:id/analyze
GET    /api/media/assets/:id/file
GET    /api/media/links?entityType=initiative&entityId=123
POST   /api/media/links
PATCH  /api/media/links/:id
PATCH  /api/media/links/order
DELETE /api/media/links/:id
```

Combined upload endpoint:

```text
POST /api/media/attachments?entityType=initiative&entityId=123
```

It may create the asset and link in one request.

Current support boundary:

- `entityType=initiative` and `entityType=task` are supported by browser upload
  UI and API.
- `entityType=category` is supported by the deterministic media tools and link
  API validation, but there is no first-class category attachment UI yet.
- `entityType=calendar_entry` and `entityType=app_chat_message` are present in
  the database enum but are not implemented in API validation/UI yet.

State events:

- extend `app_state_events.entity_type` with `media_asset` or `media_link`
- emit scoped events with `initiative_id` or `task_id` when attachments change
- browser refreshes current visible detail via existing SSE flow

## Tools

Implemented deterministic tools:

- `listMediaAttachments`
- `attachMediaToEntity`
- `updateMediaAttachment`
- `deleteMediaAttachment`
- `reorderMediaAttachments`

Tool policy:

- OpenClaw should see attachment metadata and derived text, not raw local paths.
- OpenClaw/app chat cannot directly read raw binary files; it can inspect
  stored `summary`, `textExcerpt`, and `transcript` through context or
  `listMediaAttachments`.
- Deleting an attachment link requires confirmation.
- Normal caption/role edits do not require confirmation.

Update:

- `src/core/tool-definitions.ts`
- `src/tools/index.ts`
- `src/core/state-event-classifier.ts`
- OpenClaw workspace tool policy docs
- OpenClaw web config allowed tools test

## Conversation Context

Update `src/chat/conversation-context.ts` whenever schema lands.

For initiative/task contexts include a compact media block:

```text
Media attachments (N):
- #assetId [image/jpeg, 320 KB] filename.jpg; caption: ...; summary: ...
- #assetId [application/pdf, 1.2 MB] proposal.pdf; excerpt: ...
```

Do not include raw binary data. Do not include full transcripts/OCR by default.
Use truncated derived text only.

Update `tests/chat/context-schema-sync.test.ts` expected signature only after
inspecting and updating resolver behavior.

## Browser UI

Implemented first in existing detail views:

- initiative detail: media section below or near markdown memory
- task detail: media section near notes/checklist

Implemented controls:

- file picker button
- drag/drop upload zone
- upload progress/error state
- image thumbnails
- audio/video previews on cards and full players in the media modal
- PDF preview thumbnails and embedded PDF modal view
- text/Markdown document preview
- document card with filename, type, size for generic/Office documents
- caption edit
- delete/unlink
- drag/drop reordering
- click-through media modal with read-only file facts, editable caption,
  editable derived analysis text, expandable long text, and re-analysis with
  optional user focus prompt

Avoid making media part of the text editor. Media should render as first-class
attachments beside text.

Update:

- `web/src/types.ts`
- `web/src/api.ts`
- `web/src/App.tsx`
- `web/src/styles.css`

## Later Enhancements

After Attachment v1:

- attach media directly to chat messages
- let user send image/document plus text to DMAX drawer
- expose safe agent-side re-analysis or richer media reading tools if needed
- stronger PDF/text extraction for documents
- richer video thumbnail extraction and duration metadata
- Telegram media ingestion
- category and calendar-entry attachments
- background jobs for OCR/transcription/summarization
- storage migration path to object storage for VPS/production

## Verification

Minimum tests for v1:

- migration adds tables/indexes and preserves existing DBs
- media asset repository create/find/list
- media link repository create/list/update/delete
- API upload creates asset plus link for initiative/task
- API file endpoint serves correct content type
- state events emitted for attachment changes
- conversation context includes media metadata for initiative/task
- `context-schema-sync` updated after resolver inspection

Run:

```bash
npm run typecheck
npm test
npm run web:build
```
