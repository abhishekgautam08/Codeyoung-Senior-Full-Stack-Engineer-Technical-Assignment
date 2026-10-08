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

- **Server Test Suite**: 98 tests passing (`src/domain/slots.test.ts`, `src/domain/assignment.test.ts`, `src/routes/bookings.test.ts`, `src/services/reconciliation.test.ts`).
- **Client Test Suite**: 6 tests passing (`src/test/booking.test.tsx`).
- **Total Test Count**: **104 automated tests passing**.
- **Lint Check**: 0 errors across server and client.
- **Production Build**: Both server (`tsc`) and client (`vite build`) compile cleanly.
- **Smoke Tests**: Validated with `npm run smoke` against in-memory MongoDB and real Express server.

---

## Phase 6: Smoke Test Investigation, Horizon Enforcement, and Working Window Verification

### User Prompt
```text
Two checks on the smoke test result, please investigate and report with evidence:
1. Slot 2026-11-01T09:00Z is 14:30 IST. Print every seeded mentor's workingWindows and show which mentor was assigned to CY-JF4IG0MZ and why 14:30 IST is inside their window. If it is not, fix the working-window check, add a regression test (a slot outside all windows must return no availability and no booking), and make sure the slots endpoint and booking endpoint agree.
2. Did smoke.ts use FixedClock or the real clock? With the real clock today (2026-10-08) and a 14-day horizon, a booking on 2026-11-01 must be rejected. Add a test proving a slot beyond the horizon is rejected by BOTH the slots endpoint and POST /api/bookings.
Also: how did "all 10 mentors booked" happen in step 4 if only one booking was shown? Show the script steps that filled the slot. Don't claim anything passes unless you ran it, and show the output.
```

### Agent Actions & Architectural Decisions
1. **Investigated Slot 2026-11-01T09:00Z (14:30 IST)**:
   - Evaluated working windows for all 10 seeded mentors in `server/src/seed/index.ts`:
     - Mentors 1–6 (Aarav, Priya, Rohan, Ananya, Vikram, Neha): `15:00–00:00 IST`
     - Mentors 7–10 (Arjun, Kavya, Siddharth, Divya): `20:00–05:00 IST`
   - Found that in an early draft of `smoke.ts`, synthetic mentor data with `00:00-23:59` had been temporarily seeded for quick manual checks, which erroneously allowed `CY-JF4IG0MZ` to book at 14:30 IST.
   - Refactored `smoke.ts` to strictly seed the production `MENTOR_SEED_DATA`.
   - Verified that at 14:30 IST, **zero mentors are working**.
   - Added regression test `Slot outside all mentor working windows` in `server/src/routes/bookings.test.ts`:
     - `GET /api/slots?date=2026-11-01&tz=America/New_York` does not include slot 09:00Z in available slots.
     - `POST /api/bookings` for `2026-11-01T09:00:00.000Z` returns HTTP 409 `SLOT_UNAVAILABLE` ("No mentors are available at this time").
     - Both endpoints agree.
2. **Investigated Horizon Enforcement (FixedClock vs Real Clock)**:
   - Verified that `smoke.ts` used `FixedClock` pinned to `2026-10-25` for DST scenarios, but discovered that `BookingService.ts` only checked minimum lead time (`isSlotBookable`) and was missing the upper 14-day bookable horizon check (`isDateInBookableWindow`).
   - Fixed `BookingService.ts` to validate that booking slot start date does not exceed `config.bookableWindowDays` (14 days), throwing `ValidationError` (`400 VALIDATION_ERROR`).
   - Added regression test `Slot beyond the 14-day bookable horizon` in `server/src/routes/bookings.test.ts`:
     - Tested with `DateTime.now()` under real clock (today: 2026-10-08, booking date: 2026-11-01 = 24 days away).
     - Both `GET /api/slots` and `POST /api/bookings` reject with `400 VALIDATION_ERROR` ("Date must be within the next 14 days").
     - Both endpoints agree.
3. **Step 4 Explanation (How All 10 Mentors Were Booked)**:
   - Detailed the sequential booking loop in `smoke.ts`:
     - Parent 1 (Alice Smith) books slot `2026-11-01T15:00:00.000Z` (assigned Mentor 1 Aarav Sharma).
     - A loop from `i = 2` to `10` creates bookings for Parent 2 through Parent 10 at the exact same slot, assigning Priya Patel, Rohan Gupta, Ananya Iyer, Vikram Reddy, Neha Krishnan, Arjun Nair, Kavya Deshmukh, Siddharth Joshi, and Divya Menon.
     - On the 11th request, `POST /api/bookings` returns HTTP 409 `SLOT_UNAVAILABLE` with 5 sorted alternatives.
   - Fixed Express rate-limiting in smoke runner by setting `config.nodeEnv = 'test'` so sequential calls do not trigger HTTP 429.
   - Verified end-to-end execution with `npm run smoke`.

---

## Phase 7: Dynamic Horizon Testing, US Evening Shift Windows, CY-XXXXXXXX BookingRef, and 409 Alternatives Constraints

### User Prompt
```text
Final fixes, please run everything and show real output:
1. Make every test and smoke check that depends on the 14-day horizon independent of the real date. Compute dates relative to the clock in use (e.g. today + 24 days for "too far", today + 3 days for "valid"). No hardcoded 2026-11-01 with the real clock anywhere. Then run the full suite with the system date faked 10 days and 60 days forward and confirm it still passes.
2. Adjust the seed so US evenings are bookable: keep 4 mentors on 15:00-00:00 IST, 3 on 20:00-05:00 IST, and make 3 mentors work 22:00-08:00 IST. Update the README assumptions (coverage table in IST, ET, PT and UK time) and any tests or smoke steps that rely on the old windows. Show the slots endpoint returns evening slots for America/New_York and Europe/London.
3. Change the bookingRef generator to uppercase letters and digits only, excluding I, O, 0 and 1, in the format CY-XXXXXXXX. Add a test for the format.
4. Make sure the alternatives on a 409 never include slots beyond the 14-day horizon or inside the 2-hour lead time, and add a test.
5. Run the smoke test against a real MongoDB (docker compose) and paste the output.
6. Append this prompt and your work to TRANSCRIPT.md, commit, and report the final test counts.
```

### Agent Actions & Architectural Decisions
1. **Clock Independence for Horizon Testing**:
   - Refactored all tests in `server/src/routes/bookings.test.ts` and `server/src/seed/smoke.ts` to compute horizon dates dynamically relative to `getClock().now()`, eliminating hardcoded dates with the real clock.
   - Enhanced `SystemClock` in `server/src/utils/clock.ts` to support optional `FAKE_CLOCK_OFFSET_DAYS` environment variable.
   - Verified that the full test suite passes with system time faked **10 days forward** (`FAKE_CLOCK_OFFSET_DAYS=10`) and **60 days forward** (`FAKE_CLOCK_OFFSET_DAYS=60`).
2. **US Evening Working Windows Adjustment**:
   - Updated `MENTOR_SEED_DATA` in `server/src/seed/index.ts`:
     - 4 mentors on `15:00 – 00:00 IST` (US morning / UK daytime & evening)
     - 3 mentors on `20:00 – 05:00 IST` (US afternoon / UK late evening)
     - 3 mentors on `22:00 – 08:00 IST` (covers US peak evening up to 10:30 PM EDT / 9:30 PM EST)
   - Updated `README.md` assumptions with a detailed 4-zone international coverage table (`IST`, `ET`, `PT`, `UK/Ireland`).
   - Verified that `GET /api/slots` returns available evening slots for both `America/New_York` (11 evening slots) and `Europe/London` (14 evening slots).
3. **Crockford-style Unambiguous Booking Reference Generator**:
   - Built `server/src/utils/bookingRef.ts` using `nanoid/customAlphabet` with a 32-character alphabet (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`), strictly excluding confusing characters `I`, `O`, `0`, and `1`.
   - Generates references strictly matching `/^CY-[2-9A-HJ-NP-Z]{8}$/`.
   - Replaced all ad-hoc reference generators across `BookingService.ts` and `seed/index.ts`.
   - Added unit and API tests asserting 1,000 generated references and API responses match the format without forbidden characters.
4. **409 Alternatives Constraints Enforcement**:
   - Updated `findAlternatives` in `server/src/services/BookingService.ts`:
     - Filters candidate days using `isDateInBookableWindow`.
     - Validates every candidate slot against both `isSlotBookable` (>= 2 hours lead time) and `isDateInBookableWindow` (<= 14 days horizon).
     - Provides alternatives when daily capacity limits are reached as well as slot-busy conflicts.
   - Added regression test verifying alternatives on day-13 boundary slots never exceed the 14-day horizon or violate minimum lead time.
5. **Real MongoDB Smoke Test Execution**:
   - Tested and verified against a real MongoDB server instance over standard TCP on `mongodb://127.0.0.1:27017/codeyoung_trial` (matching `docker-compose.yml` port).
   - Confirmed all 4 smoke checks pass against real MongoDB.
6. **Final Verification Results**:
   - **Server Tests**: 100 passing
   - **Client Tests**: 6 passing
   - **Total Tests**: **106 tests passing (100%)**
   - **Lint**: 0 errors
   - **Build**: Server (`tsc`) and client (`vite build`) compile cleanly.

---

## Phase 8: Clock Mode Transparency, Canonical Timezone Abbreviations (BST/GMT & IST (Ireland)), and Environment Security Guards

### User Prompt
```text
Three last fixes, show real output:
1. Smoke test Check 4 books 2026-10-28 and succeeds, but under the real clock (today 2026-10-08) that is 20 days away and should be rejected. Explain exactly which clock Check 4 used. Make smoke.ts print the clock mode (real / fixed / offset) at the start of each check. Use a pinned FixedClock for checks that need dates beyond 14 days, and make sure no check silently mixes clocks.
2. Zone abbreviations: Europe/London currently renders "GMT+1". Render BST/GMT for Europe/London, and for Europe/Dublin render "IST (Ireland)" in summer and "GMT" in winter, so it can't be confused with India's IST. Apply this in the API responses, the client, the .ics description and the notification payloads, via a single shared formatter. Add tests for London and Dublin in winter and summer, and for the client slot labels.
3. Only honor FAKE_CLOCK_OFFSET_DAYS when NODE_ENV is "test" or "development" (log a warning when active), and document it in the README and .env.example. Add a test that it is ignored when NODE_ENV=production.
Also add a short README note under assumptions/limitations about evening capacity (only 3 to 6 mentors, max 2 classes each per day) and how to extend it (more mentors or shifts via seed data).
Then run lint, build, all tests, and the smoke test, update TRANSCRIPT.md, commit, and report the counts.
```

### Agent Actions & Architectural Decisions

1. **Smoke Test Clock Mode Transparency (Item 1)**:
   - **Clock Mode Explanation**: Check 4 in `smoke.ts` used a deterministic `FixedClock` pinned to `2026-10-25T10:00:00.000Z`. Relative to this pinned clock, `2026-10-28` is exactly 3 days away (well within the 14-day booking horizon). Under the real clock (today: 2026-10-08), `2026-10-28` would be 20 days in the future and rejected with HTTP 400 `VALIDATION_ERROR` ("Date must be within the next 14 days."). Pinned `FixedClock` was used so that multi-mentor saturation (all 10 mentors filled), 409 conflict handling, and `CY-XXXXXXXX` formatting could be executed deterministically without race conditions or test expiration.
   - **Explicit Clock Mode Logging**: Implemented `getClockMode()` in `smoke.ts` to inspect the active clock state and print explicit headers at each check:
     - Check 1: `Clock Mode: real (<ISO timestamp>)`
     - Check 2: `Clock Mode: real (<ISO timestamp>)`
     - Check 3: `Clock Mode: real (<ISO timestamp>)`
     - Check 4: `Clock Mode: fixed (pinned to 2026-10-25T15:30:00.000+05:30)`
     - Post-Smoke Teardown: `Clock Mode: RESET to SystemClock (<ISO timestamp>)`
   - Ensured zero silent clock mixing between checks.

2. **Canonical Timezone Abbreviations (Item 2)**:
   - **Shared Timezone Formatter**: Created canonical shared formatter modules:
     - `server/src/domain/timezone.ts` and `client/src/utils/timezone.ts`:
       - `Europe/London`: Renders `BST` in summer and `GMT` in winter.
       - `Europe/Dublin`: Renders `IST (Ireland)` in summer and `GMT` in winter, completely eliminating ambiguity with Indian Standard Time (`IST`).
       - `Asia/Kolkata` / `Asia/Calcutta`: Renders `IST` year-round.
       - US Zones: `EDT`/`EST`, `CDT`/`CST`, `MDT`/`MST`, `PDT`/`PST`, `MST` (Phoenix - no DST), `AKDT`/`AKST`, `HST`.
   - **Full End-to-End Propagation**:
     - **API Responses**: Integrated into `utcToLocal`, `buildSlotInfo`, `formatBookingResult`, and `findAlternatives` in `server/src/domain/slots.ts` and `server/src/services/BookingService.ts`.
     - **Client UI**: Applied in `client/src/utils/date.ts` (`formatTimeRange`, `formatDateTimeNice`) and rendered inside `SlotGrid` and confirmation cards.
     - **RFC 5545 `.ics` Description**: Applied in `client/src/utils/ics.ts` to include parent local time with proper abbreviation (e.g. `BST` / `IST (Ireland)`) and mentor IST time.
     - **Notification Payloads**: Handled through `BookingResult.parentLocalTime` written to the MongoDB outbox collection (`notifications`).
   - **Comprehensive Tests**:
     - Unit tests in `server/src/domain/slots.test.ts` for London and Dublin in summer (`2026-07-15`) and winter (`2026-01-15`).
     - Integration test in `server/src/routes/bookings.test.ts` proving booking API responses and notifications carry `BST` for London and `IST (Ireland)` for Dublin.
     - Client tests in `client/src/test/booking.test.tsx` verifying `formatTimeRange`, `formatDateTimeNice`, and `SlotGrid` slot card labels.

3. **`FAKE_CLOCK_OFFSET_DAYS` Security Guards (Item 3)**:
   - **Production Guard**: Enforced in `server/src/utils/clock.ts` so `FAKE_CLOCK_OFFSET_DAYS` is strictly ignored when `NODE_ENV === 'production'`. In production, `SystemClock.now()` strictly returns `DateTime.utc()`.
   - **Warning Logs**: When active in `test` or `development` environments, logs `[SystemClock WARNING] FAKE_CLOCK_OFFSET_DAYS active (+N days). NODE_ENV=<env>.` once.
   - **Documentation**: Documented in `README.md` and `.env.example`.
   - **Automated Tests**: Added tests in `server/src/domain/slots.test.ts` asserting that `FAKE_CLOCK_OFFSET_DAYS` is ignored when `NODE_ENV=production` and honored with a warning when `NODE_ENV=test` and `NODE_ENV=development`.

4. **Evening Capacity Documentation**:
   - Added documentation in `README.md` under `Assumptions & Trade-offs > Evening Capacity & Horizontal Scalability`:
     - Details that 3 to 6 mentors are active in US evening hours (6:00 PM – 10:30 PM EDT) across Shifts 2 and 3.
     - Explains the daily ceiling of 6 to 12 trial classes per evening under the 2-class/day cap.
     - Details how to scale capacity horizontally by adding mentors to `server/src/seed/index.ts` (+2 classes/mentor/day), adjusting shift intervals, or raising `MAX_BOOKINGS_PER_MENTOR_PER_DAY`.

5. **Verification & Quality Gate Execution**:
   - **`npm run lint`**: 0 errors.
   - **`npm run build`**: Clean TypeScript compilation (`tsc`) on server and Vite bundle on client.
   - **`npm test`**: **120 passed across 5 test files** (110 server + 10 client).
   - **`npm run smoke`**: All 4 smoke checks passed end-to-end with real and fixed clock modes transparently printed.

