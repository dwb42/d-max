# DMAX UI Copy Language

This file defines naming, labels and writing rules for DMAX.

The goal is consistency. The same concept should have the same name everywhere.

## Voice

DMAX copy should be:

- concise
- calm
- precise
- helpful
- non-corporate
- non-playful unless explicitly intended
- free of unnecessary explanation

Avoid:

- marketing language inside the app
- vague labels
- technical database terms
- long paragraphs in operational UI
- inconsistent German/English mixtures

## Language decision

Phase 4 recommendation: normal user-facing DMAX UI should use German. This requires human confirmation before broad copy migration.

Until that confirmation is made, do not perform broad copy changes only for language alignment. When implementing a touched reference route after confirmation, use the German vocabulary in `UI_DESIGN_DECISIONS.md`.

Technical/debug surfaces may use English technical terms where they are genuinely developer-facing.

If German is not confirmed, keep internal UI terms consistently in English.

Use one term per concept.

Do not mix alternatives such as:

- Person / Contact / Human
- Organization / Company / Account
- Project / Initiative / Workstream
- Task / Todo / Action

Do not mix German and English within the same normal workflow.

## Canonical object names

Use these labels consistently:

| Concept | Preferred label | Avoid |
|---|---|---|
| Category | Category | Area, Life Area, Bucket, Group unless explicitly renamed |
| Project | Project | Initiative, Workstream, Case unless domain-specific |
| Task | Task | Todo, Action Item, Job |
| Habit | Habit | Routine unless explicitly meant |
| Person | Person | Contact, Human, Individual |
| Organization | Organization | Company, Account, Org |
| Contact Point | Contact Point | Contact Detail, Channel, Medium |
| Address | Address | Location unless not postal |
| Relationship | Relationship | Link if the meaning is semantic |
| Calendar Event | Calendar Event | Appointment unless product language changes |
| Time Block | Time Block | Slot, Booking |
| Note | Note | Memo unless product language changes |
| Description | Description | Info, Details, Data |
| Context | Context | CRM, Contacts, People & Companies unless intentionally changed |

## Common section labels

Preferred labels:

- Overview
- Context
- Description
- Notes
- Next actions
- Linked objects
- Relationships
- Contact points
- Addresses
- Timeline
- Calendar
- Time blocks
- Metadata
- Activity
- Settings

Avoid vague labels:

- Info
- Data
- More
- Other
- Misc
- Details, unless it truly means miscellaneous detail

## Action labels

Use verbs.

Preferred:

- Create project
- Add task
- Link person
- Add contact point
- Edit description
- Open project
- Archive organization
- Remove relationship
- Schedule time block
- Sync calendar event

Avoid:

- Submit
- OK
- Manage, unless the action opens a management flow
- Update, if the user is editing ordinary content
- Save changes, unless in a form/modal context

## Empty state copy

Empty states should be specific and action-oriented.

Pattern:

```text
Title: No linked people yet
Description: Add people who are relevant to this project.
Action: Link person
```

Examples:

```text
No contact points yet
Add an email address, phone number or website for this organization.
```

```text
No linked tasks yet
Create tasks that move this project forward.
```

```text
No description yet
Add context so this object is easier to understand later.
```

Avoid:

```text
No data available.
```

```text
Nothing here.
```

## Error copy

Error copy should explain what failed and what the user can do.

Preferred:

```text
Could not save organization
Your changes were not saved. Try again.
```

```text
Could not load linked tasks
Refresh the page or try again later.
```

Avoid:

```text
Error
```

```text
Something went wrong
```

unless no more specific explanation is available.

## Loading copy

Use short loading copy only where helpful.

Examples:

- Loading project...
- Loading linked tasks...
- Saving changes...

Do not add loading copy to every tiny state if skeleton/loading visuals are enough.

## Status labels

Use consistent status labels across object types where possible.

Suggested generic statuses:

- Draft
- Planned
- Active
- In progress
- Waiting
- Blocked
- Done
- Archived

For dates/time:

- Flexible
- Locked
- Synced
- Imported
- Read-only

## Relationship labels

Use relationship labels that describe the semantic meaning.

Examples:

- works for
- owns
- responsible for
- involved in
- related to
- precedes
- follows
- belongs to
- linked to

Avoid using only generic "linked" when a more meaningful relationship type exists.

## Modal titles

Modal titles should describe the action.

Examples:

- Edit organization
- Add contact point
- Link person
- Edit project dates
- Archive task

Avoid:

- Details
- Edit
- Manage

## Field labels

Use human labels, not database names.

Preferred:

- Legal name
- Organization type
- Display name
- Email address
- Phone number
- Website
- Street address
- Postal code
- City
- Country

Avoid exposing:

- `legal_name`
- `organization_type`
- `created_at`
- `owner_id`

unless in developer/debug contexts.

## Description writing style

Descriptions should be short and useful.

Good:

```text
Describe what this organization does and why it matters in your context.
```

Bad:

```text
Here you can enter additional information and all kinds of details regarding this organization.
```

## Capitalization

Use sentence case for labels and headings.

Preferred:

- Linked objects
- Contact points
- Edit organization

Avoid title case unless the product explicitly adopts it:

- Linked Objects
- Contact Points
- Edit Organization

## Punctuation

Avoid punctuation in labels and headings unless needed.

Buttons should not end with periods.

Descriptions may use normal sentence punctuation.
