# AI-Assisted Development Transcript: Codeyoung Trial Booking System

This document contains the chronological record of the AI-assisted development process for the Codeyoung Trial Class Booking System, detailing user prompts, agent responses, key architectural decisions, errors encountered, and resolutions across all project phases.

---

## Phase 1: Planning, Monorepo Scaffolding, Models, Domain Logic, and Seed

### User Prompt
```text
# ROLE
You are a senior full-stack engineer (MERN, TypeScript). Build a production-quality, demo-ready trial-class booking app for the Codeyoung Senior Full Stack Engineer assignment. Work in a planning-first way: first write an implementation plan, then build in phases, running tests after each phase.

# PRODUCT GOAL
Parents (US/UK/Ireland) book a trial class with an available mentor (India). The system handles time zones, DST, mentor capacity, concurrency, and gives a clear, customer-friendly UX including error/empty states.

# FIXED BUSINESS RULES
- 10 seeded mentors (Indian names, timezone Asia/Kolkata).
- Max 2 trial classes per mentor per day. "Day" = the mentor's local calendar day (IST).
- ~20 parent bookings/day expected, so the design must stay correct at that scale and be easy to scale further.
- Trial class duration: 30 min. Slots start every 30 min. Make duration, slot interval, and capacity configurable via env/config constants.
- Mentor working windows (seed, in IST, stored as data, not hardcoded in logic): 6 mentors 15:00–00:00 IST (covers US morning/UK evening), 4 mentors 20:00–05:00 IST (covers US evening/night). Windows may cross midnight, so handle that.
- Minimum lead time: a slot must start at least 2 hours from now. Bookable window: next 14 days.
- A parent can't double-book the same slot (same email + same start time).

# TECH STACK
- Frontend: React + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS. Accessible, responsive, polished.
- Backend: Node.js + Express + TypeScript. Validation with Zod. Logging with pino. Central error handler.
- DB: MongoDB with Mongoose. Do NOT assume a replica set (no multi-document transactions); get correctness with unique indexes and atomic conditional updates. Provide docker-compose.yml for local Mongo and also support MONGODB_URI from .env.
- Time: Luxon (IANA time zones only). NEVER use fixed UTC offsets or hand-rolled DST logic.
- Tests: Vitest or Jest + Supertest + mongodb-memory-server. ESLint + Prettier.
- Error handling: structured JSON with clear codes (SLOT_UNAVAILABLE, SLOT_IN_PAST, TOO_SOON, DUPLICATE_BOOKING, VALIDATION_ERROR).
- Concurrency: race condition test with 25 parallel requests for the same slot. Show that no mentor gets >2 bookings/day and no slot is double-booked.
- UI: clean, accessible, responsive. Date picker, timezone selector (with US/UK/Ireland presets and auto-detect), morning/afternoon/evening grouping, mentor cards, confirmation screen with .ics download, error/empty states.
- Deliverables: working repo, README with setup instructions and design rationale, TRANSCRIPT.md.
```

### Agent Actions & Architectural Decisions
1. **Implementation Plan Formulated**: Outlined data architecture, database schema, domain-driven Luxon timezone calculations, and concurrency mechanics without multi-document transactions.
2. **Monorepo Structure**: Set up npm workspaces with `server` and `client`.
3. **Database Schema Design**:
   - `Mentor`: Stores Indian mentors with working windows (`[{ startLocal: '15:00', endLocal: '00:00' }]` and `[{ startLocal: '20:00', endLocal: '05:00' }]`).
   - `Booking`: Compound partial unique index on `{ mentorId: 1, slotStartUtc: 1 }` where `status: 'CONFIRMED'`. Compound partial unique index on `{ parentEmail: 1, slotStartUtc: 1 }` where `status: 'CONFIRMED'`.
   - `MentorDailyLoad`: Compound unique index on `{ mentorId: 1, mentorLocalDate: 1 }` for atomic conditional counter increments.
   - `Notification`: Outbox collection recording transactional confirmation messages.
4. **Domain Logic (`server/src/domain/slots.ts`)**:
   - Strict UTC instant generation from parent local calendar days.
   - Handling midnight-crossing mentor working windows (e.g. 20:00 to 05:00 IST).
   - Daylight Saving Time boundary awareness: 23-hour spring-forward skipping missing hours, 25-hour fall-back generating both occurrences with distinct labels (EDT vs EST).
   - `LeastLoadedStrategy`: Dynamically sorts mentors by ascending booked count on that mentor's IST calendar date.

### Errors Encountered & Fixes in Phase 1
- **PowerShell Execution Policy Error**: Running `npx` or `npm` directly produced `PSSecurityException`.
  - *Fix*: Invoked `npm.cmd` and `npx.cmd` explicitly in all Windows shell commands.
- **Timezone Abbreviation Mismatch**: Luxon returned `GMT+5:30` instead of `IST` for `Asia/Kolkata` under Node.js default ICU.
  - *Fix*: Explicitly mapped `Asia/Kolkata` and `Asia/Calcutta` to return `IST` as `tzAbbr`.

---

## Phase 2: Booking Engine, Concurrency Safety, and API Routes

### Agent Actions & Architectural Decisions
1. **Concurrency Protocol (`server/src/services/BookingService.ts`)**:
   - Engineered the two-phase reservation protocol:
     - Step 1: `findOneAndUpdate` with `{ mentorId, mentorLocalDate, count: { $lt: 2 } }` and `$inc: { count: 1 }` (upsert: true).
     - Step 2: `Booking.create(...)` with unique partial index.
     - Compensation Rollback: Catch MongoServerError code 11000 on booking insert, decrement counter with `$inc: { count: -1 }`, and attempt the next candidate mentor.
2. **REST Endpoints**:
   - `GET /api/slots?date=YYYY-MM-DD&tz=...`
   - `POST /api/bookings` (with `Idempotency-Key` header support)
   - `GET /api/bookings/:bookingRef`
   - `DELETE /api/bookings/:bookingRef`
   - `GET /api/mentors` & `GET /api/mentors/:id/schedule`
   - `GET /api/timezones/suggested`
3. **OpenAPI / Swagger Documentation**: Embedded Swagger UI at `/api/docs`.
4. **Integration Test Suite**: Created tests covering validation, duplicate prevention, cancellation, and two 25-parallel-request race condition harnesses in `bookings.test.ts`.

### Errors Encountered & Fixes in Phase 2
- **MongoMemoryServer Initial Download Timeout**: The integration test suite timed out during the initial 600MB binary download.
  - *Fix*: Increased Vitest `hookTimeout` to 120s and `testTimeout` to 60s.

---

## Phase 3: Client Wizard, Timezone/Date Selectors, and Conflict UX

### Agent Actions & Architectural Decisions
1. **Frontend Stack**: Scaffolded Vite React 19 with TypeScript, Tailwind CSS, Lucide icons, and Luxon.
2. **Step-by-Step Booking Wizard**:
   - **Step 1**: Date carousel (14-day window), searchable timezone selector with US/UK/Ireland presets, and Morning/Afternoon/Evening grouped slot grid.
   - **Step 2**: Details form capturing parent name, email, student details, with validation.
   - **Step 3**: Confirmation card with mentor bio, local times for parent and mentor, meeting link, and RFC 5545 `.ics` download.
3. **Conflict Modal**: Displays HTTP 409 conflict message and allows parents to click a recommended alternative slot directly.
4. **Mentor Schedule & System Stats**: Added tabbed views allowing reviewers to inspect mentor shifts, daily counters, and verify capacity invariants.

---

## Model Switch & Resumption

### User Prompt
```text
i change model so understand old context an dcontinue
```

### Agent Actions
Restored context from the implementation plan and codebase, verified that all server and client files were intact, confirmed all 87 tests passed, and prepared for final gap closure.

---

## Phase 4: Final Gap Closure (Items 1 through 9)

### User Prompt
```text
# TASK
The app is built. Now close the remaining gaps before submission. Work through the items in order, run `npm test`, `npm run lint` and `npm run build` after each one, and fix any failure before moving on. Don't rewrite working code unless an item requires it. Keep commits small with conventional commit messages.

## 1. Make all tests independent of the real clock
- Audit every test and every piece of code that calls `DateTime.now()`, `new Date()` or `Date.now()` (slot generation, lead-time check, 14-day horizon, calendar availability, seed demo bookings).
- Introduce an injectable `Clock` (e.g. `clock.now(): DateTime`) in the domain and service layers, with a `SystemClock` for production and a `FixedClock` for tests. Alternatively use `vi.setSystemTime` consistently.
- Pin the "now" in every test, so that fixed dates like 2026-03-08, 2026-03-29, 2026-10-25 and 2026-11-01 are always inside the 14-day horizon relative to the pinned time and the tests never expire.
- Add one test proving behavior is identical when the suite runs with a different system date (e.g. run a sample under a faked date 6 months later).

## 2. Fully booked days in the calendar
- Verify that `GET /api/availability/calendar?month=YYYY-MM&tz=<IANA>` exists and returns, per parent-local date, `{date, hasAvailability, limited}`. If it's missing, implement it in the service layer by reusing the slot generation logic (one query for the bookings and loads in range, not one per slot).
- In the client date strip/calendar, disable fully booked days (with a tooltip or label "Fully booked"), mark "Few slots left" days as limited, and show a "Jump to next available day" button when the selected day is full.

## 3. Client tests (React Testing Library + Vitest)
Add at least these tests:
- Slot grid: renders slots grouped into Morning/Afternoon/Evening in the parent's time zone with the zone abbreviation, and selecting a slot enables "Continue".
- Fall-back day: two 1:30 AM slots render with distinct labels (EDT vs EST).
- 409 conflict: when the booking API returns SLOT_UNAVAILABLE, the alternatives modal appears with clickable alternative slots.
- Fully booked day: the date is disabled and the empty-state message is shown.
- Details form validation: invalid email and empty name show inline errors, and the submit button is disabled while submitting (no double-submit).
Mock the API client; don't call the real server.

## 4. Backend edge-case tests (add only what's missing)
- A US evening slot that falls on the next IST calendar date counts against the mentor's IST date, not the parent's.
- A mentor with 2 bookings on one IST date is skipped, but is still available the next IST date.
- All 10 mentors are booked for a slot → 409 SLOT_UNAVAILABLE with a non-empty `alternatives` array sorted by closeness.
- The same parent email cannot book the same slot twice (DUPLICATE_BOOKING).
- Cancelling frees both the slot and the daily counter, and cancelling twice is safe (idempotent).
- Past slot → SLOT_IN_PAST; a slot inside the 2-hour lead time → TOO_SOON; invalid IANA timezone → 400 VALIDATION_ERROR.
- Notification outbox: after a booking, two notifications are written (parent and mentor); the parent's has the parent's local time with the zone abbreviation, and the mentor's has IST time.

## 5. Counter-leak safety (known limitation)
- Add a small reconciliation function, `reconcileMentorDailyLoad(mentorLocalDate?)`, that recomputes counts from CONFIRMED bookings and corrects drift in `MentorDailyLoad`. Expose it as `npm run reconcile` and add a unit/integration test that simulates a leaked counter.
- Document this in the README as the mitigation for a crash between the counter increment and the booking insert.

## 6. Repo hygiene
- Add or verify a `.gitignore` (node_modules, dist, build, coverage, .env, *.log, .DS_Store). Make sure no `.env` is committed and `.env.example` documents every variable.
- Ensure `npm run lint`, `npm run build`, `npm test` and `npm run seed` all work from the repo root on a fresh clone. Seed must be idempotent.
- Remove dead code, console.logs and unused dependencies.

## 7. README completion
Make sure the README has all of these sections (add what's missing and don't remove existing content):
...
## 8. TRANSCRIPT.md
...
## 9. Final verification
...
```

### Detailed Execution of Gap Closure Items

#### Item 1: Injectable Clock & Time Invariance
- Created `server/src/utils/clock.ts` with `Clock` interface, `SystemClock`, `FixedClock`, `getClock()`, `setClock()`, `resetClock()`.
- Refactored `slots.ts`, `BookingService.ts`, and `routes/slots.ts` to accept injectable clocks.
- Pinned `PINNED_NOW` in `bookings.test.ts` and `slots.test.ts` to `2026-10-15T10:00:00.000Z`.
- Added 6-month-later invariance unit test proving identical slot generation under shifted system clocks.
- Tested, linted, built, and committed: `commit 580d526: feat: injectable Clock interface for time-independent testing`.

#### Item 2: Calendar Month Availability & Date Strip Enhancements
- Implemented `server/src/services/AvailabilityService.ts` executing a single batch query for all bookings and mentor loads across the month.
- Mounted `GET /api/availability/calendar?month=YYYY-MM&tz=...` in `routes/slots.ts`.
- Enhanced `client/src/components/DateStrip.tsx` with disabled fully booked days (`Full`), limited badges (`Limited`), and "Jump to next available day" button.
- Added integration tests for `/api/availability/calendar`.
- Tested, linted, built, and committed: `commit 837b79b: feat: calendar month availability endpoint and client date strip availability indicators`.

#### Item 3: Client Unit & Component Tests (React Testing Library + Vitest)
- Installed Vitest, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` in `client`.
- Created `client/vitest.config.ts`, `client/src/test/setup.ts`, and `client/src/test/booking.test.tsx`.
- Covered:
  1. Slot grid grouping (Morning/Afternoon/Evening) and selection enabling continue.
  2. Fall-back day with two 1:30 AM slots labeled EDT vs EST.
  3. 409 conflict alternatives modal with clickable alternative slots.
  4. Fully booked day empty state message.
  5. Details form inline validation & disabled button during submission.
- *Issue & Fix*: JSDOM form submission failed custom email validation when `<input type="email">` had invalid format because HTML5 native validation blocked `onSubmit`. Added `noValidate` to `<form>`.
- Tested, linted, built, and committed: `commit 7e01db8: feat(client): add comprehensive client unit and component tests with vitest`.

#### Item 4: Backend Edge-Case Tests & Alternatives Generation
- Added `findAlternatives` in `BookingService.ts` to compute nearest available slots sorted by `|altUtc - requestedUtc|`.
- Made `cancelBooking` idempotent: returning existing cancelled booking if already cancelled, preventing double counter decrements.
- Added comprehensive edge-case tests in `bookings.test.ts`:
  1. US evening slot falling on next IST date counts against mentor IST date.
  2. Mentor with 2 bookings on one IST date skipped, available next date.
  3. All 10 mentors booked returns 409 with non-empty `alternatives` array sorted by closeness.
  4. Duplicate parent email prevention (`DUPLICATE_BOOKING`).
  5. Idempotent cancellation freeing slot and daily counter.
  6. `SLOT_IN_PAST`, `TOO_SOON`, and `VALIDATION_ERROR` error code assertions.
  7. Notification outbox verifying parent local time with zone abbreviation and mentor IST time.
- Tested, linted, built, and committed: `commit 7036dc2: test(server): add comprehensive backend edge case tests and alternatives generation`.

#### Item 5: Counter-Leak Safety & Reconciliation
- Implemented `reconcileMentorDailyLoad(mentorLocalDate?)` in `server/src/services/reconciliation.ts`.
- Built CLI runner `server/src/seed/reconcile.ts` and exposed as `npm run reconcile`.
- Added unit and integration tests simulating counter drift in `server/src/services/reconciliation.test.ts`.
- Configured `fileParallelism: false` in `server/vitest.config.ts` to prevent parallel MongoMemoryServer instance port contention on Windows.
- Tested, linted, built, and committed: `commit b89afd5: feat(server): add mentor daily load reconciliation service, script, and tests`.

#### Item 6: Repo Hygiene
- Verified `.gitignore` covers `node_modules/`, `dist/`, `build/`, `.env`, `.env.local`, `*.log`, `coverage/`, `.DS_Store`.
- Verified `.env.example` documents all variables matching `server/src/config/index.ts`.
- Verified seed idempotency (`findOneAndUpdate` with `upsert`).
- Verified 0 `console.log` statements in source files.
- Verified root `npm test`, `npm run lint`, `npm run build`, `npm run seed` all succeed.

#### Item 7: Comprehensive README Completion
- Enriched `README.md` with:
  - Screenshots and visual demo placeholders.
  - Complete prerequisites, setup commands, and environment variable table.
  - Mermaid architecture diagram and directory tree.
  - Deep-dive time zone and DST design (23h/25h days, US vs UK transition divergence, cross-midnight IST calculation).
  - Concurrency design with two-phase locking, rollback compensation, and reconciliation.
  - OpenAPI / Swagger documentation summary.
  - Assumptions and deliberate trade-offs.
  - Research notes comparing Calendly and Cal.com.
  - Known limitations and future roadmap.
  - "How I used AI" summary.
- Committed: `commit 98acb15: docs: complete comprehensive README with architecture, DST, concurrency, and research notes`.

#### Item 8: TRANSCRIPT.md
- Generated this comprehensive transcript capturing all prompts, actions, errors, and fixes across the entire session.

---

## Phase 5: Final Verification Results

- **Server Test Suite**: 96 tests passing (`src/domain/slots.test.ts`, `src/domain/assignment.test.ts`, `src/routes/bookings.test.ts`, `src/services/reconciliation.test.ts`).
- **Client Test Suite**: 6 tests passing (`src/test/booking.test.tsx`).
- **Total Test Count**: **102 automated tests passing**.
- **Lint Check**: 0 errors across server and client.
- **Production Build**: Both server (`tsc`) and client (`vite build`) compile cleanly.
- **Smoke Tests**: Validated with curl against local server.
