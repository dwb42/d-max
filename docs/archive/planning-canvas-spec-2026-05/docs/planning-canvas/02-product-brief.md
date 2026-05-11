# Product Brief: Planning Canvas

## Product concept

The Planning Canvas is a zoomable, pannable, time-aware canvas where initiatives can be placed on a soft timeline, connected by relationship lines, visually enriched by category context, and pulled in from an unmapped parking lot.

It is not just a canvas view. It is a **temporal planning canvas**: a hybrid between a whiteboard, loose roadmap, dependency map, and calendar.

## Problem

The existing app has list and calendar/timeline-style views. These are useful for execution and date-based review, but they do not give the user a good way to:

- plan further ahead,
- model rough intent,
- see sequences,
- see how ideas become planning projects and implementation projects,
- understand nesting,
- understand interrelatedness,
- arrange future work spatially before it becomes exact.

## Core goal

Give the user a flexible, visual, time-aware workspace where initiatives can be arranged, nested, sequenced, connected, and gradually turned from vague ideas into concrete projects.

## User mental model

The user needs to represent several kinds of structure.

### Category context

Example:

```text
Health
Work
Travel
Relationships
Business
```

Categories should help the user understand life/business area context without making the canvas rigid.

### Containment

Example:

```text
South America Trip
├── Beach Holiday
├── Backpacking
└── Meditation Retreat
```

### Succession / dependency

Example:

```text
Idea → Planning Project → Implementation Project
```

### Time placement

Example:

```text
Trip to Helsinki: July 29 – August 1
```

### Soft intent

Example:

```text
I want to work on this planning project sometime in June.
```

Important: the current schema only has date fields, not a formal soft/hard date model. The canvas can visually support soft planning without mutating actual dates in MVP.

### Task ownership

Example:

```text
South America Trip
├── Book flights
├── Renew passport
└── Research retreat options
```

Tasks should remain secondary in canvas v1.

## Experience principles

1. The canvas should support rough planning, not only exact scheduling.
2. The horizontal axis represents time.
3. The vertical axis is freeform.
4. Cards must remain readable even when the represented duration is short.
5. Relationships must be visually understandable.
6. The user should be able to reduce visual noise.
7. Category color and emoji should help orientation.
8. Domain data and canvas layout should remain separate.
9. The first version should feel like a time-aware whiteboard, not a strict Gantt chart.
