# DMAX UI Component Extraction Plan

## 1. Status

Status: Phase 9A extracted core primitives; Phase 11A extracted party contact/address primitives.

Scope: extract canonical components proven by `/organizations/:id` and `/projects/:id` / `/initiatives/:id`.

Non-goals:

- Do not migrate `/people/:id`, `/tasks/:id` or `/categories/:name` during extraction.
- Do not redesign the app shell.
- Do not change API contracts, schema or package dependencies.
- Do not broaden visual design beyond preserving current validated behavior.

## 2. Extraction Principles

- Preserve current organization and project detail behavior.
- Move generic UI primitives out of `web/src/App.tsx` before the next route migration.
- Keep entity-specific composition in route-specific components.
- Keep style class names stable unless a rename is necessary and low-risk.
- Extract tests only where practical; at minimum run existing typecheck/build/test after extraction.
- Avoid premature abstraction around business data. Components should receive already-shaped display props.

## 3. Proposed File Structure

Recommended target structure:

```text
web/src/components/ui/
  EntityDetailPage.tsx
  EntityHeader.tsx
  InlineEditableText.tsx
  SectionBlock.tsx
  DescriptionBlock.tsx
  MetadataGrid.tsx
  RelationList.tsx
  EditModal.tsx
  EmptyState.tsx
  ErrorState.tsx
  RichText.tsx
  index.ts

web/src/components/party/
  ContactPointList.tsx
  AddressBlock.tsx
  index.ts

web/src/components/context/
  ContextPanel.tsx
  DmaxAgentButton.tsx

web/src/components/entity-detail/
  OrganizationDetailView.tsx
  InitiativeDetailView.tsx
```

If the project prefers fewer directories, `web/src/components/` is acceptable, but generic UI primitives should not remain mixed with route logic in `App.tsx`.

## 4. Component Extraction Inventory

| Component | Current implementation location | Proposed target file | Purpose | Props/data shape | Routes that will use it | Dependencies | Risk | Priority | Extract before `/people/:id` |
|---|---|---|---|---|---|---|---|---|---|
| `EntityDetailPage` | `web/src/App.tsx:8749` | `web/src/components/ui/EntityDetailPage.tsx` | Detail page grid with primary content and optional aside | `children`, `aside`, `className` | organization, project/initiative, person, task, category | React, CSS classes | low | high | yes |
| `EntityHeader` | `web/src/App.tsx:8619` | `web/src/components/ui/EntityHeader.tsx` | Canonical detail header shell | `title`, `titleContent`, `subtitle`, `subtitleContent`, `facts`, `primaryAction`, `secondaryActions`; keep icon/type optional | all entity detail routes | React, CSS classes | medium | high | yes |
| `InlineEditableText` | `web/src/App.tsx:8659` | `web/src/components/ui/InlineEditableText.tsx` | Direct editing for title/name/subtitle fields | `value`, `label`, `required`, `disabled`, `className`, `onSave` | organization, project/initiative, person, task, category | React state/effects | medium | high | yes |
| `SectionBlock` | `web/src/App.tsx:8770` | `web/src/components/ui/SectionBlock.tsx` | Canonical section container | `title`, `description`, `actions`, `children`, `className` | all detail routes | `SectionHeader` | low | high | yes |
| `SectionHeader` | `web/src/App.tsx:8758` | `web/src/components/ui/SectionBlock.tsx` or `SectionHeader.tsx` | Section title/action row | `title`, `description`, `actions` | all detail routes | React | low | high | yes |
| `DescriptionBlock` | `web/src/App.tsx:8880` | `web/src/components/ui/DescriptionBlock.tsx` | Rendered markdown/context with quiet empty state and expand/collapse | `title?`, `text`, `emptyTitle`, `emptyDescription?`, `onEdit?` | organization, project/initiative, task notes, category later | `SectionBlock`, `RichText` | medium due `RichText` dependency | high | yes |
| `MetadataGrid` | `web/src/App.tsx:8942` | `web/src/components/ui/MetadataGrid.tsx` | Secondary metadata display | `items: Array<{ label; value }>` | all detail routes | `SectionBlock`, `EmptyState` | low | high | yes |
| `RelationList` | `web/src/App.tsx:8962` | `web/src/components/ui/RelationList.tsx` | Relation rows with compact empty state | `children`, `emptyTitle`, `emptyDescription?` | organization, project/initiative, person, task, category | `EmptyState` | low | high | yes |
| `RelationGroup` | `web/src/App.tsx:8967` | `web/src/components/ui/RelationList.tsx` or `RelationGroup.tsx` | Group related objects by semantic relationship | `title`, `description`, `actions`, `children`, empty copy | organization, project/initiative, person, category | `SectionHeader`, `RelationList` | low | high | yes |
| `RelationItem` | `web/src/App.tsx:8978` | `web/src/components/ui/RelationList.tsx` or `RelationItem.tsx` | Compact linked-object row | `icon`, `title`, `meta`, `detail`, `onOpen`, `actions` | organization, project/initiative, person, task, category | CSS, optional icons from caller | low | high | yes |
| `EditModal` | `web/src/App.tsx:8785` | `web/src/components/ui/EditModal.tsx` | Canonical contained editing modal | `title`, `description`, `label`, `onCancel`, `onSubmit`, `children`, `footer`, `className` | all edit modals | `useModalEscape`, `handleModalEscape` | medium due keyboard behavior | high | yes |
| `ConfirmModal` | `web/src/App.tsx:8819` | `web/src/components/ui/EditModal.tsx` or `ConfirmModal.tsx` | Custom confirmation modal for destructive actions | `title`, `description`, `confirmLabel`, `cancelLabel`, `extraActions`, `busy`, callbacks | tasks, media, relations, delete flows | modal keyboard helpers | medium | high | yes |
| `EmptyState` | existing in `web/src/App.tsx` | `web/src/components/ui/EmptyState.tsx` | Calm empty-state copy | `title`, `description?`, `action?`, compact variant if needed | all routes | React | low | high | yes |
| `ErrorState` | `web/src/App.tsx:9009` | `web/src/components/ui/ErrorState.tsx` | User-facing route/section error state | `title`, `description?`, optional action later | all routes | React | low | high | yes |
| `ContactPointList` | extracted from `web/src/App.tsx` | `web/src/components/party/ContactPointList.tsx` | Structured communication endpoints | contact points, callbacks, party ID | organization, person | contact editor, relation styles | medium | high | yes |
| `ContactPointModal` / `ContactPointEditor` | extracted from `web/src/App.tsx` as `ContactPointEditor` | `web/src/components/party/ContactPointList.tsx` | Add/edit contact point modal | draft/contact, save/cancel/delete callbacks | organization, person | `EditModal`, form helpers | medium | high | yes |
| `AddressBlock` | extracted from `web/src/App.tsx` | `web/src/components/party/AddressBlock.tsx` | Structured postal address display | addresses, callbacks, party ID | organization, person | address editor | medium | high | yes |
| `AddressModal` / `AddressEditor` | extracted from `web/src/App.tsx` as `AddressEditor` | `web/src/components/party/AddressBlock.tsx` | Add/edit address modal | draft/address, save/cancel/delete callbacks | organization, person | `EditModal`, form helpers | medium | high | yes |
| `ContextPanel` / `AgentDrawer` | `web/src/App.tsx`, `AgentDrawer`, `DmaxAgentButton` | `web/src/components/context/ContextPanel.tsx` and `DmaxAgentButton.tsx` | Contextual DMAX drawer and entry point | label, conversations, messages, draft, busy, callbacks | all contextual routes | chat types/API, `ChatView` | high | medium | not required before person if layout helper is extracted |
| `DmaxAgentButton` | `web/src/App.tsx:2238` | `web/src/components/context/DmaxAgentButton.tsx` | DMAX context action | status, active, onClick | all routes | OpenClaw status type | low | medium | no |
| `RelationshipManager` | not fully implemented; partial route-specific forms | future `web/src/components/ui/RelationshipManager.tsx` | Dedicated dense relationship editing | relationship groups, pickers, create/link/delete callbacks | project/initiative, organization, person | relation APIs and pickers | high | medium | no, but decide before broad relation migration |
| `TechnicalMetadataDisclosure` | conceptual only | future `web/src/components/ui/TechnicalMetadataDisclosure.tsx` | Hidden debug/internal metadata | items, optional default collapsed | debug/config/entity details | `SectionBlock` | low | low | no |

## 4A. Phase 9A Extraction Status

| Component | Status | Target file | Current users | Known limitations | Ready for `/people/:id` |
|---|---|---|---|---|---|
| `EntityDetailPage` | extracted | `web/src/components/ui/EntityDetailPage.tsx` | organization detail, project/initiative detail | CSS remains in `web/src/styles.css`; drawer-safe behavior remains app-shell CSS | yes |
| `EntityHeader` | extracted | `web/src/components/ui/EntityHeader.tsx` | organization detail; project header remains route-specific but can use it later if simplified | Supports optional icon/entity type for ambiguous contexts; normal routes must not pass them by default | yes |
| `InlineEditableText` | extracted | `web/src/components/ui/InlineEditableText.tsx` | organization header | Single-line direct edit only | yes |
| `SectionBlock` / `SectionHeader` | extracted | `web/src/components/ui/SectionBlock.tsx` | organization detail, project/initiative detail, relation groups, metadata, description | Visual variants remain class-based | yes |
| `DescriptionBlock` | extracted | `web/src/components/ui/DescriptionBlock.tsx` | organization description, project/initiative markdown | Uses extracted `RichText`; edit modal remains caller-owned | yes |
| `MetadataGrid` | extracted | `web/src/components/ui/MetadataGrid.tsx` | organization detail, project/initiative detail | Does not implement technical disclosure | yes |
| `RelationList` | extracted | `web/src/components/ui/RelationList.tsx` | organization relationships, project participants/relations | Display primitive only; supports card, inline or hidden empty rendering; not a relationship manager | yes |
| `RelationGroup` | extracted | `web/src/components/ui/RelationList.tsx` | organization relationships | Supports lightweight empty groups; project dense relationship editor remains route-local | yes |
| `RelationItem` | extracted | `web/src/components/ui/RelationList.tsx` | organization contact/address/relations/context, project participants | Caller supplies icons and actions | yes |
| `EditModal` | extracted | `web/src/components/ui/EditModal.tsx` | organization/project edit modals and modal helpers | Simple modal primitive only, not a form framework | yes |
| `ConfirmModal` | extracted | `web/src/components/ui/EditModal.tsx` | delete/unlink confirmations | Confirmation copy/actions remain caller-owned | yes |
| `EmptyState` | extracted | `web/src/components/ui/EmptyState.tsx` | app-wide existing empty states | Full empty-state card remains available; lightweight relation empties are handled by `RelationList.emptyMode` rather than by making every `EmptyState` compact | yes |
| `ErrorState` | extracted | `web/src/components/ui/ErrorState.tsx` | organization detail and section errors | Route-specific retry/actions not implemented | yes |
| `RichText` / `renderInlineMarkup` | extracted | `web/src/components/ui/RichText.tsx` | app chat/activity rendering, description blocks, task/project/media text | Markdown support remains intentionally lightweight | yes |
| `ContactPointList` | extracted | `web/src/components/party/ContactPointList.tsx` | organization detail, person detail | Owns local add/edit/delete modal state but receives all persistence callbacks from route components | yes |
| `ContactPointModal` / `ContactPointEditor` | extracted as `ContactPointEditor` | `web/src/components/party/ContactPointList.tsx` | organization detail, person detail | Kept in the same file as `ContactPointList` to avoid premature file sprawl | yes |
| `AddressBlock` | extracted | `web/src/components/party/AddressBlock.tsx` | organization detail, person detail | Owns local add/edit/delete modal state but receives all persistence callbacks from route components | yes |
| `AddressModal` / `AddressEditor` | extracted as `AddressEditor` | `web/src/components/party/AddressBlock.tsx` | organization detail, person detail | Kept in the same file as `AddressBlock`; address delete/save copy remains caller-configurable | yes |
| `ContextPanel` / `AgentDrawer` | deferred | future `web/src/components/context/ContextPanel.tsx` | app shell | Coupled to app-level chat state; drawer-safe CSS was preserved | no |
| `DmaxAgentButton` | deferred | future `web/src/components/context/DmaxAgentButton.tsx` | app shell | Low-risk later extraction, not needed before person detail | no |
| `RelationshipManager` | deferred | future `web/src/components/ui/RelationshipManager.tsx` | not implemented | Dense project relationship editor must not be frozen as canonical manager | no |
| `TechnicalMetadataDisclosure` | deferred | future `web/src/components/ui/TechnicalMetadataDisclosure.tsx` | not implemented | No current extracted implementation | no |

## 4B. Phase 10 Person Migration Follow-Up

Phase 10 migrated `/people/:id` to the canonical entity detail pattern.

This section records the state immediately after Phase 10. Phase 11A extraction status is recorded in section 4C.

Extraction status after Phase 10:

| Component | Status after Phase 10 | Current users | Next action |
|---|---|---|---|
| `EntityDetailPage` | extracted and reused | organization, project/initiative, person | continue using for future detail routes |
| `EntityHeader` | extracted and reused | organization, person; project/initiative partially uses equivalent route-local structure | continue using; migrate remaining route-local headers opportunistically |
| `MetadataGrid` | extracted and reused | organization, project/initiative, person | continue using |
| `RelationList` / `RelationGroup` / `RelationItem` | extracted and reused | organization, project/initiative, person | continue using for display-only relationships |
| `ContactPointList` | generalized but not extracted | organization, person | extract to `web/src/components/party/ContactPointList.tsx` before broader party/contact work |
| `ContactPointModal` / `ContactPointEditor` | reused but not extracted | organization, person | extract with `ContactPointList`; keep modal keyboard behavior from `EditModal` helpers |
| `AddressBlock` | generalized but not extracted | organization, person | extract to `web/src/components/party/AddressBlock.tsx` before more party migrations |
| `AddressModal` / `AddressEditor` | reused but not extracted | organization, person | extract with `AddressBlock` |
| `ContextPanel` / `AgentDrawer` | deferred | app shell, contextual entity routes | defer until drawer state extraction is explicitly needed |
| `RelationshipManager` | deferred | not implemented canonically | define separately; do not freeze project dense editor |

## 4C. Phase 11A Party Contact/Address Extraction Status

Phase 11A extracted the party-neutral contact and address components used by `/organizations/:id` and `/people/:id`.

| Component | Status after Phase 11A | Target file | Current users | Limitations |
|---|---|---|---|---|
| `ContactPointList` | extracted | `web/src/components/party/ContactPointList.tsx` | organization detail, person detail | Owns local modal state; persistence remains route-level via callbacks |
| `ContactPointItem` | extracted | `web/src/components/party/ContactPointList.tsx` | `ContactPointList` | Display primitive only |
| `ContactPointEditor` | extracted | `web/src/components/party/ContactPointList.tsx` | `ContactPointList` | Uses current contact point fields only; no communication history |
| `AddressBlock` | extracted | `web/src/components/party/AddressBlock.tsx` | organization detail, person detail | Owns local modal state; persistence remains route-level via callbacks |
| `AddressList` | extracted | `web/src/components/party/AddressBlock.tsx` | `AddressBlock` | Display primitive only |
| `AddressEditor` | extracted | `web/src/components/party/AddressBlock.tsx` | `AddressBlock` | Uses current address fields only |

## 5. Recommended Extraction Order

### Step 1: Extract foundational UI primitives

Extract first:

- `EmptyState`
- `ErrorState`
- `SectionBlock`
- `SectionHeader`
- `EntityDetailPage`
- `EntityHeader`
- `InlineEditableText`

Reason: these have low business-data coupling and are needed by every migrated detail route.

### Step 2: Extract content primitives

Extract next:

- `DescriptionBlock`
- `MetadataGrid`
- `RelationList`
- `RelationGroup`
- `RelationItem`

Reason: these define the visible canonical language and are already used by both organization and project/initiative detail.

### Step 3: Extract modal primitives

Extract:

- `EditModal`
- `ConfirmModal`
- modal keyboard helpers

Reason: modal behavior has product requirements: Escape closes, Enter saves in suitable text fields, save precedes cancel in tab order, and destructive confirmations must not use system popups.

### Step 4: Extract party-specific primitives

Extract:

- `ContactPointList`
- `ContactPointModal` / `ContactPointEditor`
- `AddressBlock`
- `AddressModal` / `AddressEditor`

Reason: `/people/:id` should reuse organization contact/address behavior instead of implementing another local form-first detail.

### Step 5: Extract or contain DMAX context helpers

Extract if low-risk:

- `DmaxAgentButton`
- drawer layout helper classes or small context-label utility

Defer full `ContextPanel` extraction if it would pull too much chat state out of `App.tsx`.

## 6. Extraction Risks

### App.tsx coupling

Most components currently live in `App.tsx` and share nearby helpers, types and styles. Extraction may reveal hidden dependencies on local functions such as `RichText`, formatting helpers and modal keyboard helpers.

Mitigation:

- extract small components one cluster at a time;
- pass formatted values from route components where possible;
- keep business-specific data shaping in route views.

### CSS coupling

Core styles are in `web/src/styles.css`. Extraction should preserve class names first. CSS module or design-token work is out of scope for Phase 9A.

### Context drawer coupling

The DMAX drawer is coupled to app-level chat state. Do not force a large state refactor just to move the visual drawer. Extract button/helper pieces first if full drawer extraction is risky.

### Relationship manager gap

Project relationships are still denser than the final ideal. Extract display primitives now, but do not freeze the dense inline project relationship editor as the canonical `RelationshipManager`.

## 7. Routes Enabled By Extraction

After Phase 9A, the next migrations can reuse shared primitives:

- `/people/:id`: highest benefit from `EntityDetailPage`, `EntityHeader`, `ContactPointList`, `AddressBlock`, `RelationList`, `MetadataGrid`, `EditModal`.
- `/tasks/:id`: benefits from `EntityHeader`, `DescriptionBlock`/notes, `SectionBlock`, `MetadataGrid`, `ConfirmModal`.
- `/categories/:name`: benefits from `EntityHeader`, `DescriptionBlock`, relation groups for projects/habits/tasks.
- Later project hardening: relationship display can reuse extracted relation primitives while a dedicated manager is designed.

## 8. Phase 9A Acceptance Criteria

Phase 9A is complete when:

- canonical UI primitives are moved out of `App.tsx`;
- organization detail still renders and behaves the same;
- project/initiative detail still renders and behaves the same;
- no unrelated route is migrated;
- `npm run typecheck`, `npm run web:build` and `npm test` pass;
- any component naming deviations from `UI_COMPONENTS.md` are documented;
- no schema/API/dependency changes are made.

## 9. Next Phase Recommendation

Recommended next implementation phase: **Phase 9A: Extract canonical components first**.

Do not migrate `/people/:id` before this extraction. The organization and project pages now validate the pattern, so the next risk is duplicating embedded route-local primitives instead of creating the reusable component layer.
