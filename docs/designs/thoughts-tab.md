# Week Portal + Thoughts Tab Plan

## V1 Scope Decision (CEO Review 2026-04-16)

After CEO review, the full portal restructure is **deferred**. Only Thought Garden ships in v1.

**V1 reduction:**

- Ship **one** new route: `/thoughts` (flat, not nested under `/week`). Deep-linked from `/week` with `?week_start=YYYY-MM-DD`.
- Ship **one** new page: Thought Garden, Gems + Recent Reflections only.
- Add **one** compact "Thought Gems" entry card on `/week`. **Do not** rewrite `/week` into card-based portal. Open Loops and Themes stay inline exactly as they are today.
- REFLECTION week-membership binds to the source entry's `local_date` (consistent with the Entry day-membership invariant), not `created_at`.

**Deferred to TODOS (not v1):** `/week/tasks`, `/week/patterns`, "Questions I Keep Asking" AI section, "Tensions" AI section, language shifts, contradictions, ask-my-thoughts, pin/gem affordance.

**Why reduce:** Only `/thoughts` carries net-new value. Tasks and Patterns subpages are 80% reorganizing content that already works inline on `/week`. The full portal restructure runs against the 2026-04-10 "fold Inbox into Week, simplify" decision, and against the voice-first iron law: don't add new concepts until users are habituated. Ship the one new surface, see if rereading happens, then decide whether the portal IA earns its indirection.

The rest of this document is the 12-month vision. Treat v1 sections as the build target and non-v1 sections as reference.

---

## Summary

Reframe **Week** from a single report page into the portal for everything the app extracted from the user's voice logs.

The product map becomes:

- **Day**: capture what happened.
- **Week**: review what surfaced and route into deeper workspaces.
- **Thought Garden**: revisit and develop reflections.
- **Open Loops / Tasks Accomplished**: act on TODOs and review completed work.
- **Patterns / Experiments / Changes**: understand recurring themes and behavior shifts.
- **Search**: find exact old records.

This is a stronger framing than a standalone Thoughts tab. Week becomes the weekly control room, not a cluttered report. Each section starts with a compact preview and links into a focused subpage.

## Core Product Principle

Week should not absorb every feature. It should **summarize, prioritize, and route**.

Each Week module gets one compact portal card:

```text
Thought Gems
3 reflections worth revisiting ->

Open Loops
5 unresolved, 8 accomplished this week ->

Recurring Themes
Deep-work mornings appeared 4 days ->
```

The subpages carry the depth. Week carries the orientation.

## Recommended Information Architecture

**V1 (ships):** `/thoughts` flat, deep-linked from `/week` with `?week_start=`. No top nav item yet.

**12-month direction (deferred):** Week becomes the portal with nested subpages.

```text
V1:
  /week                  (unchanged: themes, open loops, coach letter, report, inline)
  /thoughts              Thought Garden (deep-linked from /week Thought Gems card)

12-month vision (deferred):
  /week
    /week/thoughts       Thought Garden
    /week/tasks          Open Loops + Tasks Accomplished
    /week/patterns       Themes, Experiments, Changes
```

Flat `/thoughts` is cheaper to promote to top nav later and supports ambient rereading (Tuesday night) not just weekly-review mode.

Top nav can stay simple:

```text
Debrief | Week | Search box | Avatar
```

Do not add a top-level Thoughts nav item in this version. The Week portal solves the cold-start problem better: users arrive after reviewing their week and click into the specific kind of value they want.

Keep global search in the top nav, not inside Week. Search answers "Where did I say X?" Week answers "What mattered this week?" Do not collapse those jobs.

The top nav search should become visually quieter over time:

```text
Debrief | Week | Search | Avatar
```

On desktop, a compact search field is fine. On mobile, prefer a search icon that opens `/search` or expands an input. Avoid a wide search box that visually competes with Week.

Subpages can have scoped search or filters when needed:

- `/week/thoughts`: search reflections.
- `/week/tasks`: filter Open, Done, Dismissed.
- `/week/patterns`: filter This Week, Pinned, Active, Resolved, Dismissed, All.

These scoped controls should never replace global search. They narrow the current workspace; global search retrieves across all records.

## Week Portal Layout

Week should show a compact stack of portal modules before or around the coach report:

1. **Thought Gems**
   - Shows 1-3 high-signal REFLECTION captures from the selected week.
   - Links to `/week/thoughts?week_start=YYYY-MM-DD`.
   - Empty state: "No reflection gems yet. Record a few honest thoughts this week."

2. **Open Loops**
   - Shows open TODO count and a short preview.
   - Also shows tasks accomplished count for the selected week.
   - Links to `/week/tasks?week_start=YYYY-MM-DD`.
   - Keep quick check/dismiss actions only if they stay visually quiet.

3. **Recurring Themes**
   - Shows only the 1-3 most relevant theme signals for the selected week.
   - Links to `/week/patterns?week_start=YYYY-MM-DD`.
   - This is where experiments and behavior changes belong.
   - Never render the full theme list on `/week`; the long tail belongs on `/week/patterns`.

Recurring Themes portal card should stay compact:

```text
Recurring Themes
Deep-work mornings continued · 4-day streak
2 more patterns this week ->
```

Selection rules for the Week card:

- Show pinned themes first if they appeared this week.
- Then show themes with fresh evidence from the selected week.
- Then show themes whose streak changed meaningfully.
- Cap at 3 visible theme chips/lines.
- Collapse the rest into "N more patterns this week."
- If there are no active themes this week, show one quiet empty state: "No strong pattern yet this week."
- Do not show dismissed/resolved themes on Week.

4. **Weekly Report**
   - Keeps the time breakdown, coach letter, and status update.
   - Should feel like the narrative synthesis, not the only value on the page.

## Subpage 1: Thought Garden

Route: `/thoughts` (v1 — flat; `?week_start=` deep-linked from `/week`).

**V1 shape (ships):**

- **Gems From This Week:** REFLECTION captures for the selected week (by source entry's `local_date`), most recent first.
- **Recent Reflections:** prior 3-4 weeks grouped by week, one-line previews, source-day links (`/?date=YYYY-MM-DD`).
- **Empty state:** "No reflections yet this week. Record an honest thought."
- No pinning UI. No AI sections. No scoped search.

**Week binding:** a REFLECTION's week is determined by its source entry's `local_date`, not `created_at`. If an entry is moved across days, the REFLECTION re-weeks with it. This matches the Entry day-membership invariant and keeps source-day links consistent. Verify the capture list filter supports `week_start` on `source_date` before relying on it; if not, compute the filter client-side from capture `source_date`.

**Deferred** (Questions I Keep Asking, Tensions, Language Shifts, pin/gem affordance, scoped search): reference material below, but not v1.

---

Job: help users recover and develop meaningful reflections.

Borrow the best parts of AI journaling insight products like Natality: looking across entries over time, surfacing recurring themes, tensions, questions, and language shifts, and pointing users toward the entries worth rereading. Do not copy the spiritual/prayer framing. Debrief's version is work/life reflection grounded in voice logs.

Sections:

- **Gems From This Week**: selected/pinned/high-signal reflections.
- **Recent Reflections**: REFLECTION captures grouped by week.
- **Recurring Thoughts**: reflections connected to existing themes where possible.
- **Questions I Keep Asking**: repeated unresolved questions or decisions the user has voiced.
- **Tensions**: repeated conflicts, tradeoffs, or stuck points.
- **Language Shifts**: changes in how the user talks about the same theme over time.

Rules:

- Do not show TODOs here.
- Do not use "mark done" language.
- Every thought links back to the source day with `/?date=YYYY-MM-DD`.
- V1 should reuse existing REFLECTION captures. Avoid a new thought table until the product proves the behavior.
- If pinning is needed, prefer the lightest compatible extension of existing capture status/editing patterns.
- AI-generated insights must cite source reflections. No source, no insight.
- Insights should invite rereading and reflection, not diagnose the user or overclaim meaning.

V1 page shape:

```text
Thought Garden

Gems From This Week
3 reflections worth revisiting

Questions I Keep Asking
- What should I focus on?
- Am I overbuilding this?

Tensions
- Ambition vs. recovery
- Shipping fast vs. taste

Recent Reflections
Grouped by week, each with source-day links
```

V1 can compute this mostly from existing data:

- Gems: recent REFLECTION captures from the selected week, optionally user-pinned later.
- Questions: REFLECTION captures containing question-like language, or weekly report/theme text that identifies repeated questions.
- Tensions: use existing weekly themes and recurring theme evidence first.
- Language shifts: defer unless already visible from theme evidence; this is a phase-2 quality feature.

The product promise:

```text
Not "here is a pile of old thoughts."
Instead: "here are the thoughts your week is quietly pointing back to."
```

Do not add an open-ended "ask my journal anything" chat in v1. It is a good future direction, but it changes the product from review surface to retrieval assistant and introduces hallucination/trust problems.

Future direction:

- Ask across reflections: "Where have I talked about feeling stuck this month?"
- Theme timelines: how a recurring thought changed over weeks.
- Reflection prompts based on the user's own repeated language.
- Contradiction view: places where the user said two incompatible things across time.

These belong after the basic Thought Garden proves users click through and reread.

References:

- Natality Insights: AI looks across writing over time to surface recurring themes, patterns, tensions, and questions.
- AI journaling products commonly emphasize pattern recognition, mood/emotion tracking, growth over time, and guided prompts.
- User complaints in AI journaling/PKM spaces often center on insights that feel interesting but do not lead to action; Debrief should keep Thought Garden tied to Week, Open Loops, and Patterns so insights can become behavior change.


## Subpage 2: Open Loops + Tasks Accomplished

Route: `/week/tasks`

Job: help users close loops and see progress.

Use GTD as hidden structure, not as visible methodology. The page should help users clarify and close what is tugging at them without asking them to maintain a productivity system.

Sections:

- **Open Loops**: TODO captures with `status=open`.
- **Accomplished This Week**: TODO captures moved to `done` during or from the selected week.
- **Dismissed / Not Worth Doing**: optional secondary view, not a primary success metric.

Rules:

- Keep the existing capture statuses: `open`, `done`, `dismissed`.
- Do not add `waiting`, `someday`, priority, due date, project, or label fields in v1.
- This is the only place where "done" and "dismiss" are primary actions.
- Use GTD-inspired copy for editing: **Clarify next action**.
- Clarifying a task edits `edited_text`; it does not create a new task object or workflow state.
- Preserve source-day links.
- Avoid turning this into a full task manager. The app captures follow-up items from voice, it does not become Asana in a notebook costume.

Example interaction:

```text
Raw capture:
Need to think about onboarding

Clarified next action:
Write down 3 confusing onboarding moments before Friday
```

Same data model. Better behavior.

Week portal card:

```text
Open Loops
5 open · 7 accomplished
Clarify or close what's still tugging at you ->
```

## Subpage 3: Patterns, Experiments, Changes

Route: `/week/patterns`

Job: help users understand what keeps repeating and what they are trying to change.

Sections:

- **Recurring Themes**: active/pinned themes, with streak dots and evidence.
- **Experiments**: EXPERIMENT captures grouped by week/status.
- **Changes Noticed**: weekly report insights that suggest behavior changed, improved, or regressed.

Rules:

- Themes are long-arc pattern objects.
- Experiments are proposed behavior changes or trials.
- Changes are observed outcomes. Keep those separate.
- This page should answer: "What pattern am I in, what am I trying, and is it working?"
- Keep `/week/patterns` useful as theme count grows: default to "This Week" and "Pinned" rather than showing every historical theme at once.
- Provide long-tail access through filters: Active, Pinned, Resolved, Dismissed, All.
- Sort by relevance, not creation date: pinned first, then appeared this week, then strongest streak, then recently seen.
- Each theme row/card should show one-line summary, polarity, evidence count, last seen, and a small source trail. Avoid paragraph walls.
- Resolved/dismissed themes should stay out of the main view unless explicitly filtered in.

## Alternatives Considered

### Alternative A: Top-Level Thoughts Tab

Add `/thoughts` as a protected route and primary nav item.

**Verdict:** viable, but now second-best.

Why: it gives reflections a home, but it starts cold and competes with Week for attention. Week is already when users are in review mode, so it is a better launcher.

### Alternative B: Generic Inbox

Rename or elevate Capture Inbox and keep TODO / EXPERIMENT / REFLECTION tabs together.

**Verdict:** reject.

Why: it mirrors the database instead of the user's mental model. TODOs want resolution. Thoughts want resurfacing. Experiments want review. One inbox blurs those jobs.

### Alternative C: Week As One Long Report Page

Add Thought Gems, Open Loops, Themes, Experiments, and Tasks Accomplished directly into `/week`.

**Verdict:** reject.

Why: this creates clutter. Week should route to depth, not become a landfill of every useful output.

### Alternative D: Full Memory Layer Now

Build semantic clustering, persistent thought themes, "ask my thoughts," and AI-generated behavior-change review in one push.

**Verdict:** 12-month direction, not v1.

Why: magical, but it adds model-quality and data-model risk before the user-facing surfaces are proven.

## What Already Exists

- `REFLECTION`, `TODO`, and `EXPERIMENT` captures already exist through the captures API.
- Week already loads live Open Loops from TODO captures.
- Week already loads active/pinned recurring themes.
- Weekly audit already produces structured report JSON with time breakdown, open loops, recurring themes, and status update.
- Search already supports category filtering and source-day links.

## Implementation Plan

### V1 (ships): Thought Garden

- Add `/thoughts` route (flat, `ProtectedRoute`-wrapped).
- Build `ThoughtGardenPage.tsx`: Gems (selected week) + Recent Reflections (prior 3-4 weeks).
- Support `?week_start=YYYY-MM-DD` query param; default to current Monday if absent.
- Reuse existing `capturesApi.list({ category: 'REFLECTION', status: 'all' })`. Filter client-side by `source_date` if no backend `week_start` param exists on captures.
- Add a compact "Thought Gems" card on `/week` (not a full portal rewrite). Card links to `/thoughts?week_start=<selected>`.
- Source-day links open `/?date=YYYY-MM-DD`.
- Zero backend changes. Zero migrations.

### Deferred (follow-up PRs, not v1)

- **Week Portal Shell:** replacing inline `/week` sections with portal cards. Revisit only if inline sections become unwieldy.
- **`/week/tasks` subpage:** only if inline Open Loops exceeds ~8 items consistently or users report friction.
- **`/week/patterns` subpage:** only if inline Themes becomes overwhelming.
- **AI sections on Thought Garden** (Questions I Keep Asking, Tensions, Language Shifts): defer until 2+ months of REFLECTION volume exists.
- **Pin/gem affordance for reflections:** ship only if rereading pattern emerges.

## Data And API Direction

V1 should reuse existing APIs where possible:

- `GET /api/v1/captures?category=REFLECTION&status=all`
- `GET /api/v1/captures?category=TODO&status=...`
- `GET /api/v1/captures?category=EXPERIMENT&status=...`
- `GET /api/v1/entries/themes`
- existing weekly audit endpoints for report JSON

Only add backend fields/endpoints when the frontend cannot answer a needed question efficiently. The first likely gap is "done during selected week" for Tasks Accomplished, because current capture payload has `classified_at` and `source_date` but no explicit `status_changed_at`.

Do not introduce semantic search or embeddings in v1.

Do not introduce additional task workflow states in v1. If users repeatedly dismiss tasks they still care about, revisit `someday`. If users repeatedly leave blocked items open, revisit `waiting`. Until then, the three-state model is enough:

```text
open      = carry it
done      = closed
dismissed = stop carrying it
```

## UX Rules

- Week portal cards should be compact, not full feature sections.
- Subpages should use the existing editorial/journal design system: warm paper, hairline borders, serif page titles, quiet lists.
- Do not use dashboard KPI styling. This is a personal review space, not an analytics console.
- Mobile must stay single-column and readable.
- Empty states must teach the loop: "record more honest reflections," "finish or dismiss loops," "try one experiment this week."

## Test Plan (V1)

- Verify `/week` still renders themes, open loops, coach letter, and report inline (no regression).
- Verify `/week` renders a compact "Thought Gems" card linking to `/thoughts?week_start=<selected>`.
- Verify `/thoughts` requires auth (unauthenticated redirects to `/login`).
- Verify `/thoughts?week_start=2026-04-14` renders REFLECTION captures whose source entry's `local_date` falls in that week; never TODO or EXPERIMENT.
- Verify moving a source entry across days re-weeks the REFLECTION (covers the `local_date` invariant).
- Verify source-day links open `/?date=YYYY-MM-DD` with the source entry's current `local_date`.
- Verify loading, empty, error, and populated states on `/thoughts`.
- Verify mobile single-column readability at 375px wide.

## Not In Scope For V1

- Full Week portal restructure (card-based `/week` rewrite).
- `/week/tasks` and `/week/patterns` subpages.
- "Questions I Keep Asking" AI section.
- "Tensions" AI section.
- Language shifts, contradiction view.
- "Ask my thoughts" chat/retrieval.
- Full semantic clustering, embeddings.
- Pin/gem affordance (just show most recent REFLECTIONs).
- Scoped search on Thought Garden.
- Manual folders or tags.
- Capture-time classification controls.
- A full task manager; GTD workflow states like Waiting or Someday.
- Task due dates, priorities, labels, projects, or recurring tasks.
- AI scoring of experiment success.
- New top-level Thoughts nav item.

## Assumptions

- Week is the primary review habit and should become the portal.
- Day remains the sacred capture surface.
- Search remains global exact retrieval.
- Subpages are nested under Week because they are review-mode workspaces, not separate daily destinations.
- Existing capture categories are good enough for v1 routing.

---

## GSTACK REVIEW REPORT

### /plan-ceo-review — 2026-04-16 (SCOPE REDUCTION)

Cut v1 to flat `/thoughts` route with Gems + Recent Reflections only. Deferred portal restructure, AI sections, pin/gem affordance, and `/week/tasks` + `/week/patterns` subpages to TODOS. Bound REFLECTION week-membership to source entry's `local_date`. Rationale: only `/thoughts` carries net-new value; tasks and patterns subpages were 80% reorganizing content that already works inline on `/week`, and the full portal restructure ran against the 2026-04-10 "fold into Week, simplify" decision.

### /plan-eng-review — 2026-04-16 (PROCEED)

Reduced plan verified against code. Zero backend changes confirmed — `Capture.source_date` already exposed ([captures.py:42](../../backend/app/routes/v1/captures.py#L42), [types/api.ts:156](../../frontend/src/types/api.ts#L156)); move-invariant already satisfied at read time ([captures.py:61](../../backend/app/routes/v1/captures.py#L61)) via completed 2026-04-11 move work. Three additions specified: (1) `display_text: null` renders `'(no text)'` fallback matching OpenLoops convention, (2) `source_date: null` REFLECTIONs silently filtered out, (3) add Monday-boundary test (off-by-one trip-hazard). One performance item deferred to P3: server-side `?since=` filter on `/v1/captures/` — not v1-blocking at current <100-REFLECTION volume. Test plan artifact: `~/.gstack/projects/zhou100-time_logger_game/yujunz-feat-weekly-letter-validator-and-cleanup-eng-review-test-plan-20260416-194107.md` (16 tests: 12 new on ThoughtGardenPage, 2 on WeeklyReportPage, 0 backend). Outside voice not run — scope too small to justify a codex second opinion.
