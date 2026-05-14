# UI Reference Review: Initiative / Project Detail

## 1. Executive summary

The shared initiative/project detail page has been moved toward the refined organization detail language for comparison review. The page is now read-first, uses a two-column entity-detail layout, keeps metadata secondary, contains long markdown by default, keeps tasks visible near the top, and uses the contextual DMAX drawer overlay behavior so the main page is not squeezed into unreadable columns.

Readiness judgment: suitable for human product/design feedback, but not yet a final canonical reference. The project surface is more complex than organization detail, and the relationship editor remains dense because it combines hierarchy, dependency linking, and creation controls in one area.

## 2. What was changed

- Initiative/project body now uses `EntityDetailPage` with a primary column and secondary metadata column.
- Markdown/context now uses the headingless `DescriptionBlock` view pattern and opens a contained edit modal on click.
- Long markdown is visually contained with expand/collapse before tasks.
- Tasks moved directly after description and use a visible section-level create action.
- Participants now use the emerging relation-list visual language on initiative/project detail.
- Initiative relations are contained in a `SectionBlock` with German labels and lightweight collapsed state.
- Media now uses the same section surface as the rest of the detail page.
- Metadata now uses `MetadataGrid` and excludes internal IDs.
- DMAX drawer overlay behavior now also applies to initiative/project detail.

## 3. What organization-detail patterns were reused

- Read-first entity detail layout.
- Secondary metadata in a right-side `MetadataGrid`.
- Headingless clickable description/content surface.
- Modal-based markdown editing.
- Section-level primary action affordance.
- Lightweight empty states inside relation-style sections.
- Overlay DMAX context drawer.

## 4. What had to be adapted for project/initiative complexity

- The header keeps multiple inline controls near the title because type, status, phase and date range are operational project context.
- Tasks are promoted immediately below description because project execution depends on seeing next actions quickly.
- Relationship editing remains more complex than organization relationships because it includes parent/child structure, predecessors, successors, linking existing initiatives, and creating related initiatives.
- Media remains a full operational section because attachments can be primary working material for projects.

## 5. Screenshot inventory

| Filename | State | Demonstrates | Density | Sufficient |
| --- | --- | --- | --- | --- |
| `01-project-detail-normal.png` | Normal project detail | Header, contained description, tasks, metadata | High | Yes |
| `02-project-detail-long-description-contained.png` | Full-page capture | Long markdown containment and page order | High | Yes |
| `03-project-detail-description-edit.png` | Description edit modal | Click-to-edit markdown modal | High | Yes |
| `04-project-detail-dmax-drawer-open.png` | DMAX drawer open | Overlay drawer and scoped context label | High | Yes |
| `05-project-detail-tasks-section.png` | Tasks section | Next actions and create affordance | Medium | Yes |
| `06-project-detail-relationships-section.png` | Expanded relationships | Hierarchy/dependency controls | High | Yes |
| `07-project-detail-media-section.png` | Media section | Attachment surface in new style | Medium | Yes |
| `08-project-detail-metadata.png` | Metadata area | Secondary metadata placement | Medium | Yes |
| `09-project-detail-narrow-viewport.png` | Narrow viewport | Header wrapping and single-column detail | Medium | Yes |
| `10-project-detail-description-expanded.png` | Expanded description | Full markdown after explicit expansion | High | Yes |

## 6. Visual review

The page now feels substantially closer to a coherent DMAX entity detail page. The title is dominant, metadata is secondary, and tasks are visible before the user has to move through the entire markdown memory. The description content still has its own markdown headings because the data itself contains headings; that is acceptable for this review and different from adding a UI heading.

The most visually unresolved area is relationships: the content is useful, but the control density is still closer to an editor console than the calmer organization relation language.

## 7. Read-first vs form-first review

Pass. The default view is no longer a form-first markdown editor or a stack of unrelated panels. Editing is entered directly from the title, pills, date control, description surface, task create control, participant controls, or relationship section.

## 8. Header review

Partial pass. The header has no added decorative UI icon or entity-type eyebrow, and the title is dominant. The visible bicycle emoji is part of the project name data, not a separate header icon. Type, status, phase, date range and category are useful project context and remain near the title.

Open question: whether project names should be normalized to avoid leading emoji in canonical reference screenshots.

## 9. Description/markdown review

Pass. Markdown is contained and expandable, and editing opens through direct click on the content surface. The page is no longer dominated by a full markdown wall by default.

Open question: whether generated/seeded project markdown should use calmer heading levels or summaries, since content headings like `OVERVIEW` and `OBJECTIVE` still feel visually loud.

## 10. Tasks/next-actions review

Pass. Tasks are directly below the description, visible without scrolling past media or relationship management, and the section create action is recognizable. This preserves the action-oriented nature of project detail.

## 11. Relationships/participants review

Partial pass. Participants now use `RelationList` / `RelationItem` style and feel closer to organization detail. Initiative hierarchy and dependency relationships are contained and labeled better than before, but the create/link controls remain dense.

Recommended product review question: should hierarchy/dependency editing become a modal or drawer later, leaving the default relationship section more read-first?

## 12. Media/attachments review

Pass for this phase. Media is visually compatible with the section style and does not appear before tasks. Empty media state remains visible and usable.

## 13. Metadata review

Pass. Metadata is secondary, structured, and avoids internal IDs. It includes project-relevant facts: type, life area, status, phase, time range, lock state, counts and updated time.

## 14. DMAX drawer review

Pass for layout. The drawer overlays initiative/project detail instead of squeezing the page into cramped columns. The drawer label is scoped to the current project/initiative name. No raw context technical error was visible in the captured state.

## 15. Narrow viewport review

Partial pass. The header wraps coherently and the page becomes single-column. The amount of project context pills is high on mobile, but it remains usable and does not horizontally overflow in the captured state.

## 16. Comparison with `/organizations/:id`

The organization detail language transfers well to the project detail surface for page shape, metadata, description and DMAX drawer behavior. The project page needs stronger prioritization because tasks and timeline/date context are operationally important. Relationships are the biggest mismatch: organization relationships are mostly scan/manage lists, while project relationships are also structural planning controls.

## 17. What works well

- The page now reads as one product surface instead of stacked local panels.
- Long markdown no longer pushes all execution content out of view.
- Tasks are prominent enough for a project workflow.
- Metadata is useful without dominating.
- The drawer behavior is consistent with organization detail.

## 18. What still feels wrong or uncertain

- Relationship controls are still dense and editor-like.
- Header pills are useful but numerous; mobile density needs human judgment.
- The project markdown content itself can still feel loud due to all-caps headings.
- Media upload is functional but still visually more utilitarian than relational/product-like.

## 19. Questions for human product review

1. Should project relationship editing stay inline, or should dense create/link controls move into a modal/drawer after a read-first relationship summary?
2. Should project markdown memory keep structured headings visible by default, or should the default view show a generated/manual summary first?
3. Are type/status/phase/date/category all useful enough to stay in the header on normal project detail?
4. Does task placement directly after description feel right for project execution?
5. Should `/projects/:id` or `/organizations/:id` be the stronger reference before component extraction?

## 20. Recommended next phase

Recommended next phase: human product/design feedback on this initiative/project comparison pass.

Do not migrate another route yet. After feedback, choose one of:

- focused project detail hardening if relationship density or header context needs adjustment;
- component extraction if both organization and project detail feel directionally right;
- deeper relationship-manager design if project relationship editing should move out of the default page.
