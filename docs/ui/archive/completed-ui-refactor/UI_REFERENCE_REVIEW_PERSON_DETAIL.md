# DMAX UI Reference Review: Person Detail

## 1. Executive Summary

Phase 10 migrated `/people/:id` from a form-first detail view to the canonical DMAX entity detail pattern.

The page now follows the validated organization/project detail language:

- read-first entity header
- no default title icon
- no entity-type eyebrow
- direct title editing
- grouped master-data editing in `EditModal`
- contact points and addresses as canonical section/relation surfaces
- relationships and participations as grouped relation displays
- secondary person facts in `MetadataGrid`
- user-facing loading and not-found states
- drawer-safe contextual DMAX layout

The migration validates the canonical pattern for a person/context entity with sparse local data. Populated relationship/contact screenshots are still needed later.

## 2. What Changed

- Replaced the raw `Stammdaten` form with `EntityHeader`, inline title editing and a secondary `Stammdaten` modal.
- Replaced the split panel layout with `EntityDetailPage`.
- Reused the organization-style contact point and address surfaces for people with person-specific copy.
- Added person addresses to the read-first person detail page using the existing party address API data.
- Replaced legacy person relationship panels with `SectionBlock`, `RelationGroup`, `RelationList` and `RelationItem`.
- Added a user-facing `/people/:id` load error state.
- Added drawer-safe route layout for `person-route` so the contextual DMAX drawer overlays instead of squeezing the page into unreadable columns.

## 3. Screenshot Inventory

Screenshots are saved in `docs/ui/screenshots/reference-person-detail/`.

| Filename | Route / state | Demonstrates | Density | Sufficient |
|---|---|---|---|---|
| `01-person-detail-normal.png` | `/people/1` normal | Canonical person detail layout with sparse data | medium | yes |
| `02-person-detail-dmax-drawer-open.png` | `/people/1` DMAX drawer open | Drawer-safe layout and person context label | medium | yes |
| `03-person-edit-master-data-modal.png` | person edit modal | Grouped person basics in `EditModal` | medium | yes |
| `04-person-contact-point-editor.png` | contact point add modal | Reused contact editor from party pattern | medium | yes |
| `05-person-address-editor.png` | address add modal | Reused address editor from party pattern | medium | yes |
| `06-person-empty-relationships.png` | empty relation sections | Lightweight relationship empty states | medium | yes |
| `07-person-not-found.png` | `/people/999999` | User-facing not-found state | low | yes |
| `08-person-narrow-viewport.png` | `/people/1` narrow viewport | Responsive stacking and readable header | high | yes |

Missing later screenshots:

- Person with populated contact points.
- Person with populated addresses.
- Person linked to one or more organizations.
- Person participating in projects/tasks.
- DMAX drawer success response after sending a message.

## 4. Visual Review

The migrated person detail page is no longer admin/form-first. The person name is visually dominant, the header is quiet, and the main surface answers the core person questions: who this is, how to contact them, which parties they relate to, and where they appear in DMAX.

The page is sparse in the current local data, so the visual review mainly confirms empty-state handling and layout discipline. Empty relationship groups are acceptable but still somewhat box-heavy when every group is empty; this is consistent with the current organization reference and can be revisited after populated person data exists.

## 5. Read-First Review

Status: pass.

The permanent master-data form is removed. Editing is available through inline title edit and a grouped `Stammdaten` modal. Contact/address edits are section-scoped modals.

## 6. Header Review

Status: pass.

The header uses the canonical no-icon, no-eyebrow title pattern. The subtitle shows useful person context such as salutation and name components. The grouped edit action is secondary rather than dominant.

## 7. Contact And Address Review

Status: pass with caveat.

Contact points and addresses now use the same visual language as organization detail. Copy is person-specific where the route uses those blocks.

Phase 11A update: `ContactPointList`, `ContactPointEditor`, `AddressBlock`, `AddressList` and `AddressEditor` have been extracted into `web/src/components/party`.

## 8. Relationship Review

Status: pass for display.

Relationships are grouped into organizations and people. The current data has no relationships, so only empty-state behavior was validated.

Not implemented: full relationship management. This remains intentionally deferred; the current dense project relationship editor must not become the canonical `RelationshipManager`.

## 9. Metadata Review

Status: pass.

`MetadataGrid` contains user-relevant secondary facts only:

- salutation/title/name components
- contact/address/relation/context counts
- created/updated timestamps

Internal IDs are not shown in normal metadata.

## 10. DMAX Drawer Review

Status: pass with caveat.

The drawer opens on `/people/:id`, shows `DMAX-Kontext` scoped to the person name, and does not force the entity page into three unreadable columns.

Caveat: the screenshot confirms visual/container behavior, not a full successful agent response.

## 11. Narrow Viewport Review

Status: pass.

The entity detail layout stacks to one column. Header actions remain accessible. Metadata moves below primary content. No horizontal overflow was visible in the captured narrow screenshot.

## 12. Implementation Notes

Canonical primitives reused:

- `EntityDetailPage`
- `EntityHeader`
- `InlineEditableText`
- `SectionBlock`
- `RelationGroup`
- `RelationList`
- `RelationItem`
- `MetadataGrid`
- `EmptyState`
- `ErrorState`
- `EditModal`

Route-local logic intentionally retained:

- person data loading and mutation callbacks
- contact/address modal state
- contact/address editor implementation
- relationship display shaping
- DMAX drawer app-shell state

## 13. Known Limitations

- No person markdown/context field exists yet, so no `DescriptionBlock` was added.
- Contact/address components are now extracted, but populated person contact/address states still need fixture-backed visual validation.
- Relationship management remains display-only for person detail.
- Populated data states were not visually validated because the local fixture has one sparse person.

## 14. Recommended Next Phase

Phase 11A completed the recommended party contact/address extraction. The next entity migration can proceed without copying party contact code from `App.tsx`.
