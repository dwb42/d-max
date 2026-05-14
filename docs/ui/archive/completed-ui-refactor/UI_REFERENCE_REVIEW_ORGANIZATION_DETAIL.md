# DMAX UI Reference Review: Organization Detail

## 1. Executive summary

Phase 6 reviewed the Phase 5 `/organizations/:id` reference implementation visually.

The organization detail page is a clear improvement over the Phase 3 version. It is now read-first, has a stronger entity identity, uses a recognizable section rhythm, moves master-data editing into a modal, gives contact points and addresses structured display, and introduces a usable first `MetadataGrid`.

Phase 6 found that the normal desktop page was close, but not ready to be used as the canonical reference because the DMAX drawer state squeezed the page, the narrow viewport navigation/header broke visually, and route error handling exposed raw technical copy. Phase 7A has now addressed those blocking hardening issues for `/organizations/:id`.

Reference readiness status: **Ready after minor fixes**.

Recommended next phase: **Phase 7B: Extract canonical components from `App.tsx` into shared component files**.

## 2. Screenshots captured

Screenshots are saved under `docs/ui/screenshots/reference-organization-detail/`.

| Filename | Route/view/state | Demonstrates | Density | Sufficient for review | Missing later |
|---|---|---|---|---|---|
| `01-organization-detail-normal.png` | `/organizations/2`, normal desktop | Reference detail page with drawer closed | medium | yes | richer relationship data |
| `02-organization-detail-full-page.png` | `/organizations/2`, attempted full page | Same as normal due internal scroll container | medium | partial | true full-page capture |
| `03-organization-detail-dmax-drawer-attempt.png` | `/organizations/2`, DMAX drawer open | Drawer opens, but main content collapses badly | high | yes | drawer with populated thread |
| `04-organization-edit-master-data-modal.png` | master data edit modal | `EditModal` for organization core data | medium | yes | validation/save failure |
| `05-organization-description-edit-modal.png` | description edit modal | `DescriptionBlock` edit state | medium | yes | long markdown edit |
| `06-organization-contact-point-editor.png` | contact point add/edit modal | contact editor reuse | medium | yes | save failure |
| `07-organization-address-editor.png` | address add/edit modal | address editor reuse | medium | yes | save failure |
| `08-organization-relationships.png` | relationship section | relationship empty groups | medium | yes | populated relations |
| `09-organization-link-person-modal.png` | person link modal | contained relationship creation | medium | yes | relation removal/edit |
| `10-organization-metadata-grid.png` | metadata area | secondary metadata placement | medium | yes | denser metadata |
| `11-organization-not-found-or-load-error.png` | `/organizations/999999` | load/not-found failure behavior | low | yes | intentional 404 copy state |
| `12-organization-narrow-viewport.png` | `/organizations/2`, narrow viewport | mobile-ish layout | high | yes | drawer on narrow viewport |
| `13-organization-lower-sections.png` | lower scrolled desktop page | lower relationship and DMAX context sections | medium | yes | populated DMAX contexts |

## 3. Screenshots missing or insufficient

- DMAX drawer success with actual conversation messages was not captured; the drawer opened with an empty thread.
- DMAX drawer loading state was not captured reliably.
- DMAX drawer gateway/runtime error state was not reproduced visually in the final screenshot set, though a raw `applyContextDataBudget is not defined` banner was observed during capture attempts.
- Long `DescriptionBlock` expanded state was not captured because the local organization description is empty and this phase avoided data mutation.
- True full-page desktop capture was limited by the app's internal scroll container; `13-organization-lower-sections.png` covers the lower sections instead.
- Populated relationship/member/DMAX-context density was not available in the local fixture.
- Save-failure states for edit modals were not captured.

## 4. Reference readiness status

Status: **Ready after minor fixes**.

The Phase 7A hardening pass fixed the reference-blocking issues identified in Phase 6. The route is now acceptable as the visual reference for canonical entity detail behavior, but extraction should happen before migrating `/people/:id` so the patterns are reusable and not copied directly from `App.tsx`.

## 5. Criterion-by-criterion review

| Criterion | Result | Evidence | Notes |
|---|---|---|---|
| Read-first, not form-first | pass | `01`, `04` | Default view is no longer a raw form. |
| Organization identity visually dominant | pass | `01` | Name, entity type and type subtitle are clear. |
| Primary actions easy to find | pass | `01` | `Bearbeiten` and DMAX button are visible. |
| Secondary information de-emphasized | pass after Phase 7A | `01`, `10`, Phase 7A `01`, `04`, `05` | Metadata is secondary and `Interne ID` is no longer visible in the normal metadata grid. |
| Technical/debug metadata not prominent | pass after Phase 7A | `10`, Phase 7A `03`, `05` | Normal organization detail no longer exposes internal ID or raw not-found copy. Technical disclosure is still deferred. |
| Contact points scannable | pass | `01`, `06` | Contact row is compact and clear. |
| Addresses scannable | pass | `01`, `07` | Address row is compact and clear. |
| Relationships use shared visual language | partial pass after Phase 7A | `08`, `09`, `13`, Phase 7A `05`, `10` | Relation groups exist and empty groups are lighter; populated relationship density is still unproven. |
| Avoids arbitrary boxes/noise | partial pass after Phase 7A | `01`, `13`, Phase 7A `05` | Empty relationship groups are lighter, but the route still has enough bordered section structure to deserve caution during extraction. |
| Editing feels intentional | pass | `04`, `05`, `06`, `07`, `09` | Editing is modal-based and no longer always visible. |
| Empty states calm and useful | pass after Phase 7A | `01`, `08`, `13`, Phase 7A `05` | Empty relationship copy remains useful and is less visually heavy. |
| Error states user-facing | pass after Phase 7A | `11`, Phase 7A `03` | Organization not-found now uses a user-facing message. |
| DMAX drawer avoids raw technical errors | pass after Phase 7A | `03`, Phase 7A `02`, `06` | The drawer no longer shows `contextEntityId` copy, includes an organization context label, and no longer squeezes the page. Gateway error screenshots remain unproven. |
| Coherent DMAX product screen | pass after Phase 7A | `01`, `03`, `12`, Phase 7A `02`, `04` | Desktop, drawer-open and narrow states are now coherent enough for reference use. |
| Reusable future entity detail patterns | partial pass | source review, `01` | Primitives exist, but they are still embedded in `App.tsx` and need hardening before reuse. |

Phase 6 partial/fail issues retained for traceability. Section 24 records the Phase 7A fixes.

| Screenshot | Problem | Severity | Why it matters | Recommended fix | Required before `/people/:id`? | Type |
|---|---|---|---|---|---|---|
| `03` | Opening DMAX drawer squeezes the entity detail into unreadable narrow columns. | high | The reference route cannot define a layout that collapses when the contextual agent opens. | Add drawer-aware layout behavior for `EntityDetailPage`: single-column primary content, hide or move aside metadata, enforce min widths. | yes | visual/structural |
| `12` | Narrow viewport top navigation icons overlap and create a visually broken header. | high | Mobile-ish behavior would be inherited by future detail pages. | Fix app-shell narrow navigation/header before treating this as reusable. | yes, if narrow viewport matters for migration | visual/structural |
| `11` | Not-found/load failure exposes raw JSON parse copy. | high | Error states must be user-facing and this violates Phase 4 decisions. | Add route-level `ErrorState` copy for missing organization and failed fetch. | yes | state/copy |
| `01`, `10` | `Interne ID` is visible in normal metadata. | low | It is secondary but still technical. | Move ID to technical disclosure later, or keep only while no disclosure exists. | no | metadata |
| `08`, `13` | Empty relationship groups are large nested boxes. | medium | Empty data dominates the relationship area more than actual graph value would. | Make empty `RelationGroup` states lighter and shorter. | yes | visual/state |
| `03` | Drawer blank state has no explicit context label in the visible body. | medium | It is not obvious that the drawer is scoped to B42 GmbH. | Show current entity context in drawer header or context chip. | yes | UX/copy |

## 6. Before/after comparison with Phase 3

Compared with `docs/ui/screenshots/current/03-organization-detail.png`:

- Clearly improved: the page now has a canonical entity header, edit action, description block, contact/address sections, relationship groups and a metadata area.
- More consistent: contact points, addresses and relationships now share `RelationItem`-style rows instead of route-specific panel rows.
- More read-first: member creation is no longer inline by default; master data is no longer edited through the page title.
- Less noisy: organization core data is no longer scattered; metadata is grouped into one secondary area.
- More reusable: the page now demonstrates the intended `EntityDetailPage`, `SectionBlock`, `DescriptionBlock`, `RelationList` and `MetadataGrid` anatomy.
- Still clumsy after Phase 7A: empty relationship states are lighter, but a dedicated compact relation-empty variant should still be extracted.
- Phase 6 drawer regression fixed in Phase 7A: the DMAX drawer now overlays the organization route instead of squeezing the entity detail layout into unreadable columns.
- Still visually uncertain: populated relationship density and long markdown behavior are not proven by local data.

Compared with `docs/ui/screenshots/current/26-organization-detail-agent-error.png`:

- Improved: the prior `contextEntityId is required for organization conversations` error is no longer visible.
- Improved after Phase 7A: drawer-open layout no longer squeezes the entity page, and the drawer header labels the current organization context.
- Still unproven: populated drawer conversations and gateway/runtime error states were not captured after hardening.

## 7. Visual hierarchy review

The closed desktop page has a much stronger hierarchy than Phase 3. `B42 GmbH` is dominant, the entity type is clear, and `Bearbeiten` is visible without turning the page into a form.

Phase 7A fixed the main drawer hierarchy failure. When the DMAX drawer opens, it now overlays the right side of the route instead of forcing the entity detail grid into unreadable columns. The drawer becomes visually dominant while active, but the primary organization content remains readable.

## 8. Information density review

The normal desktop density is acceptable for sparse data. Contact points and addresses are compact. Metadata is contained.

Remaining density concerns:

- Empty relationship sections are lighter after Phase 7A, but still need a compact canonical variant during extraction.
- Metadata uses a whole side column even when it contains only five small facts.
- The narrow viewport stacks safely after Phase 7A, but sparse entities still create a long page dominated by absence.

## 9. Read-first vs form-first review

Pass. The page is now read-first. Forms appear only in modals:

- organization master data modal
- description edit modal
- contact point modal
- address modal
- person-link modal

This is a strong improvement and should remain part of the canonical detail pattern.

## 10. `DescriptionBlock` review

The empty description state is calm and clear. The edit affordance is duplicated as both section action and empty-state action, which is acceptable for an empty primary context block.

Not observed:

- long markdown collapse/expand
- markdown density with real content
- save failure behavior

Recommendation: before project migration, test `DescriptionBlock` with long markdown because project detail is the known high-risk route.

## 11. Contact points review

Pass. Contact points are scannable and action placement is predictable.

Minor concern: edit/delete icon buttons are always visible. This is acceptable for the first reference route but may become noisy with many contact points.

## 12. AddressBlock review

Pass. The address row reads as an address first, not a raw postal form. The editor remains a dense modal, but it is contained and understandable.

Minor concern: the section label says `Anschriften` while Phase 4 vocabulary also mentions `Adresse`. Keep this as acceptable German copy unless language is finalized differently.

## 13. Relationship display review

Partial pass after Phase 7A. `RelationGroup` and `RelationItem` are now visible as a canonical direction. The person-link modal is a major improvement over the old inline member form.

Remaining issue: empty groups are now lighter, but the relationship area still needs a compact extracted empty-group variant before it is reused broadly.

Not observed: populated relationships, relationship removal, relationship metadata density and organization-to-organization navigation.

## 14. `MetadataGrid` review

Pass after Phase 7A. Metadata is correctly secondary and visually contained.

Issues:

- On sparse organizations, the side metadata column may receive too much visual weight relative to content.
- On narrow viewport, metadata becomes a large trailing block.

Recommendation: keep `MetadataGrid`. Add `TechnicalMetadataDisclosure` later if internal IDs or debug facts need a user-accessible home outside normal product UI.

## 15. `EditModal` / editing review

Pass with minor caveats. Edit modals are clear, compact and consistent.

Observed modals:

- master data
- description
- contact point
- address
- person link

Minor issues:

- Modal fields still have a utilitarian form style, which is fine for contained editing.
- Relationship linking uses `member of` in English while the rest of the page is German.
- Save-failure and unsaved-change states were not observed.

## 16. Empty/loading/error state review

Empty states: pass after Phase 7A for the organization reference. Relationship-empty states are lighter and no longer dominate the route.

Loading state: partial pass. The normal detail loading fallback is simple and acceptable, but richer loading state behavior is still not canonicalized.

Error state: pass after Phase 7A for organization not-found. `/organizations/999999` now shows `Organisation nicht gefunden` with user-facing explanation instead of raw browser/API copy.

## 17. Contextual DMAX drawer review

Status: **acceptable with caveats**.

Findings:

1. The DMAX button appears in a consistent top-right location.
2. The drawer opens from `/organizations/:id`.
3. The previous raw `contextEntityId is required for organization conversations` error was not visible.
4. Phase 7A changed the drawer to overlay the organization route so the entity page stays readable.
5. The drawer header now labels the active context as `DMAX-Kontext` and `B42 GmbH`.
6. Gateway/runtime error screenshots were not reproduced after hardening, so deeper DMAX drawer resilience remains a later validation task.
7. The drawer is acceptable for the organization reference, with deeper context-panel hardening deferred.

## 18. Copy and terminology review

Mostly acceptable within the current German direction.

Issues:

- `member of` appears in the relationship modal and should be localized or mapped through relationship type labels.
- `Interne ID` has been removed from normal metadata after Phase 7A; a technical disclosure pattern is still deferred.
- Not-found error copy is now user-facing for `/organizations/:id`.
- `DMAX-Kontexte` is probably acceptable for now, but should be reviewed when the DMAX context model is formalized.

## 19. Implementation structure review

Implemented in source:

- `EntityHeader`
- `EntityDetailPage`
- `SectionBlock`
- `SectionHeader`
- `DescriptionBlock`
- `RelationList`
- `RelationGroup`
- `RelationItem`
- `MetadataGrid`
- `EditModal`
- `ContactPointList`
- `AddressBlock`
- `ErrorState`
- expanded `EmptyState`

Still conceptual or partial:

- `RelationshipManager`: partially represented by a person-link modal.
- `ContactPointEditor`: existing `ContactPointModal` acts as editor but is not named as canonical.
- `AddressEditor`: existing `AddressModal` acts as editor but is not named as canonical.
- `TechnicalMetadataDisclosure`: not implemented.
- `ContextPanel`: existing drawer is reused, not yet canonicalized.
- `LoadingState`: not implemented as a distinct canonical component.

Embeddedness:

- All new primitives are still in `web/src/App.tsx`.
- Styles are split between generic class names and route-specific context. The core class names are reusable, but drawer and narrow viewport behavior are not sufficiently resilient yet.
- Extraction should happen after Phase 7A hardening, not before, because extraction would freeze current visual problems into shared files.

Component-name divergence:

- `ContactPointList` and `AddressBlock` align with docs.
- `ContactPointModal` and `AddressModal` should eventually become or wrap `ContactPointEditor` and `AddressEditor`.
- `OrganizationRelationsSection` is route-specific composition over generic relation primitives, which is appropriate.

Implementation readiness:

- Ready as a local reference after hardening.
- Not ready for direct `/people/:id` migration yet.

## 20. Required fixes before migration

Phase 6 required the following fixes before migration. Phase 7A completed these items for `/organizations/:id`; see section 24 for screenshot evidence.

1. Fix drawer-open layout for `EntityDetailPage` so the organization page remains readable with the DMAX drawer open.
2. Replace raw organization load/not-found errors with a user-facing `ErrorState`.
3. Fix narrow viewport navigation/header overlap.
4. Lighten empty relationship group visuals.
5. Ensure contextual DMAX drawer failures never expose raw runtime errors.
6. Add visible drawer context label for the current organization.

## 21. Optional improvements

- Add `TechnicalMetadataDisclosure` if internal IDs or debug facts need to be accessible outside normal product UI.
- Reduce side metadata weight for sparse entities.
- Test and tune `DescriptionBlock` with long markdown.
- Add a compact relation-empty variant.
- Add save-failure examples for edit modals.
- Localize relationship type display in the relation-link modal.

## 22. Recommended next phase

Recommended next phase: **Phase 7B: Extract canonical components from `App.tsx` into shared component files**.

Reasoning:

- The core reference direction is now visually stable after Phase 7A.
- The six focused hardening issues have screenshot evidence.
- The remaining blocker is implementation structure: canonical primitives still live inside `App.tsx`.
- `/people/:id` should reuse extracted canonical components rather than copying embedded route code.

Do not proceed to `/people/:id` migration until component extraction has created reusable canonical detail primitives.

## 23. Open questions

- Should the canonical detail layout hide secondary metadata when the DMAX drawer is open, or is the Phase 7A overlay behavior sufficient as the reference?
- Should `TechnicalMetadataDisclosure` be implemented during component extraction, or deferred until a debug/config hardening phase?
- Should the narrow viewport icon-only navigation be polished during app-shell work, even though it no longer blocks the organization reference?
- Should `DMAX-Kontexte` remain the canonical German label for entity participations?
- Should relationship type labels come from user-facing localized vocabulary rather than raw relationship type labels?

## 24. Phase 7A hardening review

Phase 7A focused only on the six findings that blocked `/organizations/:id` from becoming a usable canonical reference. Screenshots are saved under `docs/ui/screenshots/reference-organization-detail-hardening/`.

### Screenshot evidence

| Filename | Route/view/state | Demonstrates | Sufficient |
|---|---|---|---|
| `01-organization-detail-normal-after-hardening.png` | `/organizations/2`, drawer closed | The Phase 5 reference page remains intact after hardening | yes |
| `02-organization-drawer-open-after-hardening.png` | `/organizations/2`, DMAX drawer open | Drawer overlays instead of squeezing the entity layout | yes |
| `03-organization-not-found-after-hardening.png` | `/organizations/999999` | User-facing organization not-found state | yes |
| `04-organization-narrow-viewport-after-hardening.png` | `/organizations/2`, narrow viewport | Header, actions, sections and metadata stack without horizontal breakage | yes |
| `05-organization-empty-relationships-after-hardening.png` | `/organizations/2`, relationship area | Empty relationship groups are lighter than Phase 6 | yes |
| `06-organization-drawer-context-label-after-hardening.png` | `/organizations/2`, drawer header | Drawer context label shows `DMAX-Kontext` and `B42 GmbH` | yes |
| `07-organization-master-data-modal-after-hardening.png` | master data edit modal | Existing edit modal still opens | yes |
| `08-organization-contact-point-editor-after-hardening.png` | contact point editor | Existing contact point editor still opens | yes |
| `09-organization-address-editor-after-hardening.png` | address editor | Existing address editor still opens | yes |
| `10-organization-link-person-modal-after-hardening.png` | person relationship modal | Existing relationship link modal still opens | yes |

### Six issue review

| Phase 6 issue | Phase 7A result | Evidence | Remaining risk |
|---|---|---|---|
| DMAX drawer squeezed the main page into unreadable columns | fixed | `02`, `06` | The drawer now overlays the right side and covers secondary content while open; this is acceptable for the reference but should be refined during drawer hardening. |
| Narrow/mobile viewport header/navigation visually broke | fixed enough for reference | `04` | The icon-only navigation is usable but not polished; app-shell mobile design remains a later concern. |
| `/organizations/999999` exposed raw technical error copy | fixed | `03` | None for organization not-found; broader route error handling remains outside Phase 7A. |
| Empty relationship sections were too visually heavy | fixed enough for reference | `05` | Empty relation groups are lighter, but a dedicated compact relation-empty variant should be extracted later. |
| `Interne ID` was visible in normal metadata | fixed | `01`, `04`, `05` | Technical metadata disclosure is still not implemented. |
| Drawer context was not clearly labeled as scoped to the organization | fixed | `02`, `06` | Other entity types still need verification when migrated. |

### Readiness update

Updated readiness status: **Ready after minor fixes**.

The organization detail page is now ready to serve as the visual canonical reference for entity detail behavior. It should not be copied directly into `/people/:id`; the canonical primitives should first be extracted from `web/src/App.tsx` into shared component files.

### Ready for component extraction

Yes. The reference now has stable enough visual behavior to extract:

- `EntityDetailPage`
- `EntityHeader`
- `SectionBlock`
- `SectionHeader`
- `DescriptionBlock`
- `RelationList`
- `RelationGroup`
- `RelationItem`
- `MetadataGrid`
- `EditModal`
- `ContactPointList`
- `AddressBlock`
- `EmptyState`
- `ErrorState`

### Ready for `/people/:id` migration

Not directly. `/organizations/:id` is visually ready as the reference, but `/people/:id` should wait until Phase 7B extracts the canonical components. Migrating before extraction would encourage copy-paste reuse and freeze route-specific implementation details.

### Recommended next phase

Recommended next phase: **Phase 7B: Extract canonical components from `App.tsx` into shared component files**.

Reasoning:

- The blocking visual issues have been hardened.
- The reference is now good enough to preserve.
- The largest remaining risk is implementation structure, not visual direction.
- Extraction should happen before any second entity detail migration.

## 25. Human product review after Phase 7A

Human feedback after Phase 7A accepts the overall restrained direction and page structure, but corrects several details that would become problematic if extracted as canonical components too early. The main theme is simplification: entity detail pages should not add default icons, default type eyebrows or prominent edit buttons when the name, subtype and direct manipulation are enough.

### Summary of feedback

- The organization header should be quieter: no default icon next to the name and no default `Organisation` eyebrow above the name.
- Organization type should stay visible near the name because it is meaningful primary context.
- The prominent green `Bearbeiten` button is too heavy as the default header action for small high-frequency fields.
- Name and organization type should move toward direct inline editing, while grouped master-data editing can remain available but visually secondary.
- Section-level creation/linking actions are too subtle and need a stronger canonical affordance.
- `DescriptionBlock` should become a quieter content surface: no visible `Beschreibung` heading, no default visible edit button and no visible `Beschreibung ergänzen` button.
- Empty descriptions should be quiet and clickable.
- The project/initiative detail page should later be used as a comparison route for the canonical pattern, but not before the organization reference is finalized and components are extracted.

### Feedback classification

| # | Feedback item | Bucket | Canonical impact | Organization-only? | Blocks Phase 7B? | Recommended action | Scope | Risk |
|---|---|---|---|---|---|---|---|---|
| 1 | Remove default header icon next to organization name | Must fix before component extraction | Yes. `EntityHeader` must not make icons part of normal title anatomy. | No | Yes | Make header icon optional and omit it on organization detail. Keep icons for nav, relation rows and special status contexts. | small | low |
| 2 | Remove default object type eyebrow above entity name | Must fix before component extraction | Yes. Normal detail headers should not require type eyebrows when context is already clear. | No | Yes | Make entity type label optional and omit it on organization detail. Reserve type labels for mixed lists, relation rows, search results, debug/inspector contexts or ambiguous pages. | small | low |
| 3 | Keep organization type under the name | Must preserve before component extraction | Yes. Subtype/status is a valid primary context slot. | Partly, but generalizable | Yes as a preservation constraint | Keep `Firma`/organization type as the subtitle or primary metadata line. Treat equivalent subtype/status fields as allowed header context when they improve interpretation. | small | low |
| 4 | Demote prominent header `Bearbeiten`; support direct editing for name/type | Must fix before component extraction | Yes. Freezing a prominent grouped edit button into `EntityHeader` would make later pages too button-heavy. Inline editing support belongs in the canonical header model for small frequent fields. | No | Yes | Remove the visually dominant header edit button. Add direct edit affordance for name and organization type if feasible in a narrow pass. Keep grouped master-data modal available as secondary action or fallback. | medium | medium |
| 5 | Keep restrained overall style | Defer indefinitely / not recommended as separate work | Yes, as a constraint | No | No | No separate implementation. Use as a guardrail: do not add decoration, extra cards, labels or icons while fixing blockers. | small | low |
| 6 | Later compare style on initiative/project detail | Defer until migration of other entity pages | Yes, but not for this route now | No | No | Document as a later comparison/migration request. Do not migrate project/initiative detail before extraction and organization reference finalization. | large later | medium later |
| 7 | Make section-level primary actions more visible | Must fix before component extraction | Yes. `SectionHeader` action emphasis will be reused by contact points, addresses, relationships and future entity pages. | No | Yes | Introduce a restrained section-primary action style stronger than `small-button` but less dominant than page primary actions. Apply to add/link actions such as contact point, address and person link. | small to medium | low |
| 8 | Remove visible `Beschreibung` heading | Must fix before component extraction | Yes. `DescriptionBlock` should not always be a labeled section when the content surface is self-evident. | No | Yes | Add a headingless description variant or make the title optional, then use headingless mode on organization detail. | small | low |
| 9 | Remove visible description `Bearbeiten` button | Must fix before component extraction | Yes. Description editing should support direct interaction and avoid permanent button-heavy UI. | No | Yes | Remove default visible description edit button. Make the description surface itself the edit entry point when `onEdit` exists. | small to medium | medium |
| 10 | Remove empty `Beschreibung ergänzen` button | Must fix before component extraction | Yes. Empty description behavior will be reused across project/category/task/person contexts. | No | Yes | Use quiet empty copy such as `Noch keine Beschreibung vorhanden.` or an empty clickable surface. No visible add-description button by default. | small | low |
| 11 | Description click-to-edit interaction model | Must fix before component extraction | Yes. This changes canonical `DescriptionBlock` behavior before extraction. | No | Yes | Implement click-to-edit for read and empty states, with keyboard/focus/accessibility support and clear hover/focus affordance. Keep modal/drawer editor behind that interaction. | medium | medium |

### Must-fix items before Phase 7B

These should be handled in a narrow Phase 7A.6 implementation pass before component extraction:

1. Simplify `EntityHeader` defaults:
   - no default title icon
   - no mandatory entity type eyebrow
   - keep subtype/status line such as organization type
2. Replace the prominent header `Bearbeiten` button with a quieter editing model:
   - direct title edit for organization name
   - direct organization type edit if feasible
   - grouped master-data edit remains available but secondary
3. Strengthen section-level primary actions:
   - add/link actions should be visibly actionable
   - do not make them page-primary or visually loud
4. Simplify `DescriptionBlock`:
   - no visible heading for the organization description surface
   - no visible default edit button
   - no visible add-description button
   - click the content/empty surface to edit

### Nice-to-have items before Phase 7B

- A polished hover/focus treatment for inline-editable title, subtype and description surfaces.
- Keyboard affordances for direct-edit surfaces, especially `Enter`/`Escape` behavior.
- A subtle secondary master-data affordance if inline name/type editing does not cover legal name.

These are useful, but they should stay subordinate to the must-fix interaction model.

### Deferred items

- Project/initiative detail comparison is deferred until after organization reference finalization and component extraction.
- Project/initiative migration is deferred; it should not happen in Phase 7A.5 or Phase 7A.6.
- Broad app-shell, navigation, copy-language and route migration work remains out of scope.
- Full relationship manager implementation remains deferred.

### Risks and dependencies

- Inline editing can accidentally make the read-first header feel form-like. The implementation must use display-first text with explicit focus/edit state, not permanent inputs.
- Click-to-edit description surfaces can be undiscoverable if there is no hover/focus affordance. The surface needs a restrained but perceivable affordance.
- Removing visible edit buttons reduces visual noise, but grouped master-data editing still needs a discoverable secondary path for legal name and less common fields.
- Section action styling must improve affordance without making every section compete with the entity identity.
- These changes conflict with older Phase 4 wording that made entity type and section-header description edit actions sound mandatory. Governance docs should be clarified after implementation.

### Proposed implementation plan for must-fix items only

Phase 7A.6 should be a narrow implementation pass on `/organizations/:id` and the embedded reference primitives only:

1. Adjust `EntityHeader` API and organization usage:
   - make `icon` optional
   - make `entityType` optional
   - render the organization name as the dominant header content
   - keep organization type as subtitle/primary context
2. Rework header editing:
   - remove the prominent green header `Bearbeiten` button
   - add inline/direct editing for organization name
   - add inline/direct editing for organization type if it stays small
   - keep `OrganizationCoreModal` reachable through a secondary action for grouped fields such as legal name
3. Rework `DescriptionBlock` behavior:
   - support headingless mode
   - remove default visible edit/add buttons from organization description
   - make read and empty surfaces clickable to open the existing description modal
   - keep long-text collapse/expand behavior for non-empty descriptions
4. Rework section action style:
   - introduce a restrained `section-primary-action` style or equivalent
   - apply it to `Kontaktweg hinzufügen`, `Anschrift hinzufügen` and `Person verknüpfen`
   - keep destructive and row-level edit/delete controls low-emphasis
5. Re-capture focused screenshots:
   - normal organization detail
   - header/title edit state
   - description empty/clickable state
   - section action visibility
   - narrow viewport sanity screenshot

### Phase 7B recommendation

Phase 7B should not proceed until the must-fix Phase 7A.6 items are implemented and visually checked. After that, Phase 7B component extraction should proceed before migrating `/people/:id`.

### UI governance docs to clarify after implementation

Small updates will likely be needed after Phase 7A.6:

- `UI_DESIGN_DECISIONS.md`: clarify that entity type labels and title icons are optional, not default, on normal detail pages.
- `UI_PATTERNS.md`: update `EntityHeader` and `DescriptionBlock` patterns for simplified headers and click-to-edit descriptions.
- `UI_COMPONENTS.md`: update `EntityHeader`, `EntityTitle`, `SectionHeader` and `DescriptionBlock` component contracts.

## 26. Phase 7A.6 implementation review

Phase 7A.6 implemented the must-fix human product feedback from section 25 without extracting components and without migrating other routes.

Screenshots are saved under `docs/ui/screenshots/reference-organization-detail-phase7a6/`.

| Filename | Route/view/state | Demonstrates | Sufficient |
|---|---|---|---|
| `01-organization-detail-refined-normal.png` | `/organizations/2`, normal desktop | Header without default icon/type eyebrow, quieter description block, stronger section actions | yes |
| `02-organization-title-inline-edit.png` | title edit state | Organization name edits directly from the title | yes |
| `03-organization-type-inline-edit.png` | type edit state | Organization type edits directly from the subtitle line | yes |
| `04-description-click-edit-modal.png` | description edit state | Clicking the headingless description surface opens the existing edit modal | yes |
| `05-section-actions-refined.png` | section action state | Contact/address/person link actions use stronger section-primary affordance | yes |
| `06-narrow-viewport-refined.png` | narrow viewport | Refined header and section actions remain usable in narrow layout | yes |

Implemented changes:

- `EntityHeader` no longer requires an icon or entity type label.
- `/organizations/:id` now renders the organization name as the primary header object without a title icon or `Organisation` eyebrow.
- Organization type remains visible under the name and is treated as primary context.
- Organization name and organization type can be edited directly from the header.
- The grouped organization master-data modal remains available as a secondary `Stammdaten` action.
- `DescriptionBlock` supports headingless use and click-to-edit behavior.
- Organization description no longer shows a visible `Beschreibung` heading, visible edit button or visible add-description button.
- Section-level add/link actions use a stronger restrained affordance.
- Organization reference modals now close with `Escape`, submit from single-line text fields with `Enter`, and tab from the last field to the primary save action before cancel.

Readiness note:

The organization reference is now ready for human visual review of the Phase 7A.6 refinements. If accepted, the next implementation phase should be Phase 7B component extraction before any `/people/:id` or project/initiative migration.

## 27. Phase 11B relationship section simplification review

Phase 11B applied additional human product feedback to the organization detail relationship and contact sections after the canonical primitives had been extracted.

Screenshots are saved under `docs/ui/screenshots/relationship-section-simplification/`.

Implemented changes:

- Removed redundant subtitles from organization contact points, addresses, the `Beziehungen` section, the `Personen` relation group and the `Organisationen` relation group.
- Renamed the organization DMAX context section to `Verknüpfte Initiativen und Maßnahmen`.
- Removed the DMAX context subtitle and heavy empty-state copy.
- Added lightweight empty rendering support to `RelationList` / `RelationGroup` so ordinary empty relation groups can render only their title and action.
- Applied lightweight empty relationship rendering to organization person relationships, organization relationships and linked initiative/task participations.
- Added a contained `Organisation verknüpfen` action for creating organization-to-organization party relationships through the existing `createPartyRelationship` API.
- Added contained `Initiative verknüpfen` and `Maßnahme verknüpfen` actions for creating organization participations through the existing `createEntityParticipant` API.

Notes and limitations:

- No schema, API contract or dependency changes were needed.
- The local fixture only contains one organization, so the organization-to-organization picker action is present but disabled until another organization exists.
- Initiative/task linking uses the existing entity participant model and keeps role/context as a simple optional free-text field. A full relationship manager remains deferred.
- The simplified empty-state rule should become canonical: do not render heavy "nothing here" panels for ordinary empty relation groups when the group title and link action are enough.
