# Thinking System Manual Test Guide

Date: 2026-04-28

Purpose: verify that Brainstorm Mode behaves like a thinking partner, not a
task spammer or markdown note taker.

Run these through OpenClaw/Telegram after starting the local d-max MCP server.

## Quality Bar

For exploratory input, d-max should:

- use Thinking tools, not project/task tools
- preserve uncertainty
- store typed thoughts and tensions
- avoid creating projects/tasks without explicit confirmation
- answer with cognitive structure, not tool output
- recommend one useful next thinking move

## Live Notes

2026-04-28:

- Telegram voice test passed.
- Response quality was reported as very good.
- Local embedded OpenClaw tests also passed for new-space capture and resume.
- Verified local tool behavior: Thinking tools were used, no project/task tools were called during exploratory capture, and responses followed the Thinking response pattern.
- Local Project Gate test passed after instruction tuning: `renderProjectGate` was used, no project/task was created, gate status and missing pieces were shown.
- Local Confirmed Extraction test passed: after explicit confirmation, OpenClaw called `createProject`, `linkThought`, and `updateThought`, then reported the created project and source-thought update.
- Local Task Extraction first pass failed: "Mach daraus bitte Aufgaben" created four tasks directly without `renderTaskGate`. Policy was tightened so this phrase means candidate proposal, not batch creation confirmation.
- Local Task Extraction retest passed after policy tuning: OpenClaw created `possible_task` candidates, used `renderTaskGate`, and did not create tasks without a second explicit confirmation.
- Local Confirmed Task Creation test passed: after "Ja, leg diese 5 Aufgaben genau so in der Inbox an", OpenClaw called `createTask`, `linkThought`, and `updateThought` for the confirmed candidates.

## Response Pattern

Expected answer shape:

```text
Denkbewegungen
- ...

Gespeichert
- ...

Offene Spannung
- ...

Nicht angelegt
- Keine Projekte oder Tasks angelegt.

Nächster sinnvoller Schritt
- ...
```

For voice, the same content should be compressed.

## Test 1: New Thinking Space

Prompt:

```text
Lass uns brainstormen zu Health Rhythm. Ich will fitter werden, aber abends bin ich oft platt. Fitnessstudio klingt gut, aber vielleicht ist das schon wieder zu groß. Eigentlich geht es mir mehr um Energie als um Leistung.
```

Expected tools:

```text
listThinkingSpaces
createThinkingSpace
createThinkingSession
captureThoughts
createTension
renderOpenLoops or getThinkingContext
```

Expected behavior:

- Creates a thinking space like `Health Rhythm`.
- Captures thoughts such as desire, constraint, option, fear/hypothesis, possible_project.
- Captures a tension around wanting fitness/energy but having low evening capacity.
- Does not call `createProject` or `createTask`.
- Recommends sharpening the energy/rhythm tension or turning it into a small experiment.

## Test 2: Resume Existing Thinking Space

Prompt:

```text
Zu Health Rhythm: Ich glaube, morgens wäre realistischer. Aber ich will kein Tracking und keinen komplizierten Plan.
```

Expected tools:

```text
listThinkingSpaces
getThinkingContext
createThinkingSession
captureThoughts
createTension or updateTension
renderOpenLoops or getThinkingContext
```

Expected behavior:

- Resumes the existing space instead of creating a duplicate.
- Mentions what changed: morning routine is now stronger, tracking is a constraint.
- Does not create tasks.
- Suggests a minimal test or asks whether to shape one.

## Test 3: Candidate But Not Commitment

Prompt:

```text
Vielleicht sollte daraus ein Projekt werden: vier Wochen lang eine minimalistische Morgenroutine finden. Aber ich bin noch nicht sicher.
```

Expected tools:

```text
getThinkingContext
createThinkingSession
captureThoughts
renderOpenLoops or getThinkingContext
```

Expected behavior:

- Stores a `possible_project` or hypothesis with uncertainty.
- Does not create a project.
- Says the candidate is not yet committed.
- Asks whether to pass it through the project gate.

## Test 4: Confirmed Extraction

Prompt:

```text
Ja, leg daraus ein Projekt an. Kategorie Health & Fitness. Name: Morgenroutine testen.
```

Expected tools:

```text
renderProjectGate
listCategories
createProject
linkThought
updateThought
```

Expected behavior:

- Creates the project only after confirmation.
- Links the originating thought to the project with `extracted_to`.
- Marks the source thought as `maturity = committed`.
- Resolves the source thought only if the created project fully represents it.
- Keeps the thinking space available.

## Test 5: Task Gate

Prompt:

```text
Mach daraus bitte Aufgaben.
```

Expected behavior:

- Does not blindly create all possible tasks.
- If no `possible_task` thoughts exist, creates possible task candidate thoughts first.
- Uses `renderTaskGate` for concrete candidates before task creation.
- Proposes concrete task candidates first.
- Rejects vague items or keeps them as thoughts.
- Creates tasks only after Dietrich confirms which candidates to commit.

## Test 6: Open Loops

Prompt:

```text
Was ist bei Health Rhythm gerade noch offen?
```

Expected tools:

```text
listThinkingSpaces
getThinkingContext
```

Expected behavior:

- Lists unresolved tensions and hot active thoughts.
- Distinguishes possible projects/tasks from committed work.
- Recommends one next move.

## Regression Failures

Treat these as failures:

- creates projects/tasks during exploratory capture
- stores everything as generic notes
- loses uncertainty by turning hypotheses into facts
- creates a duplicate thinking space for an obvious existing topic
- answers with a long raw dump instead of a concise cognitive view
- exposes internal IDs without being asked
