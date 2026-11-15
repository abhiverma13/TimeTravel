# Code Review

## 1. Change History

| **Change Date** | **Modified Sections** | **Rationale** |
| --------------- | --------------------- | ------------- |
| 2026-10-18 | 2, 3 | CP1: neither code review has run yet; both are scheduled for later checkpoints. |
| 2026-10-26 | 2 | CP2: ran the course's ESLint and detekt configurations locally (2 ESLint findings, justified in 2.4; none from detekt). |
| 2026-10-27 | 2 | CP2: recorded Codacy's run. It found 103 issues on `8e9f3f7`; commit `ceec5d9` fixed 8, and the other 95 are justified in 2.4. |
| 2026-11-02 | All | Shortened the wording after CP1 feedback. |
| 2026-11-12 | 2 | CP3: Codacy is to run with only detekt, ESLint and Trivy and the repository's configuration files, as the peer review pointed out; the Dockerfile finding is fixed rather than justified, and every justification cites its sources. |
| 2026-11-12 | 3 | CP3: recorded our review of Fabricate, Donut's review of TimeTravel, and what we changed in response. |

---

## 2. Automated Code Review Results

**Status at CP3:** the peer review found that Codacy ran with its default coding standard, which includes Opengrep (8 of the 95 issues at CP2). For CP3 the repository's owner configures Codacy as the course requires: under Code patterns, every tool is turned off except detekt (reading [`detekt.yml`](../detekt.yml)), ESLint (reading [`.eslintrc.json`](../.eslintrc.json)) and Trivy (all patterns), and Codacy then analyses the final commit. Sections 2.1 to 2.3 record that run.

Locally, ESLint with the course's [`.eslintrc.json`](../.eslintrc.json) over `backend/src` and `backend/tests` reports 2 findings (explained in 2.4), and detekt 1.23.8 with the course's [`detekt.yml`](../detekt.yml) over `frontend/app/src` reports none.

### 2.1. Commit Hash Where Codacy Ran

_The commit Codacy analyses for CP3, recorded by the repository owner after the run._

### 2.2. Unfixed Issues per Codacy Category

_A screenshot of the CP3 run's issues by category (`images/codacy_category_breakdown.png`), added after the run._

### 2.3. Unfixed Issues per Codacy Code Pattern

_A screenshot of the CP3 run's issues by code pattern (`images/codacy_issues_by_pattern.png`), added after the run._

### 2.4. Justifications for Unfixed Issues

- **Fixed since CP2:** the container now runs as the unprivileged `node` user ([`backend/Dockerfile`](../backend/Dockerfile)), so Codacy's non-root `USER` finding no longer applies; the deployment makes the TLS key readable by that user ([README](../README.md), deployment step 3). The other Opengrep findings (NoSQL injection, SSRF) came from a tool the course's setup does not use.

- **ESLint: TypeScript rules that need type information** (`@typescript-eslint/no-misused-promises`, `no-unsafe-return`, `require-await`, `no-unsafe-argument`, `no-redundant-type-constituents`), if Codacy reports them:
    - **Justification:** these rules "utilize TypeScript's type checking APIs", which "requires TypeScript to analyze your entire project instead of just the file being linted" ([typescript-eslint, Linting with Type Information](https://typescript-eslint.io/getting-started/typed-linting)). The types of `express`, `supertest`, `socket.io` and `mongodb-memory-server` come from the installed packages, so a run without them sees those values as `any`; at CP2 Codacy's own messages showed this ("Unsafe return of an error typed value", and "'any' overrides all other types in this union type" for `MongoMemoryServer | undefined`). With the dependencies installed (`npm ci`), the course's [`.eslintrc.json`](../.eslintrc.json), which enables these rules as errors, reports none of them over `backend/src` and `backend/tests`.

- **ESLint: `security/detect-non-literal-fs-filename`**, at [`backend/src/index.ts`](../backend/src/index.ts) (its two `readFileSync` calls)
    - **Justification:** the rule "Detects variable in filename argument of `fs` calls, which might allow an attacker to access anything on your system" ([eslint-plugin-security rule documentation](https://github.com/eslint-community/eslint-plugin-security/blob/main/docs/rules/detect-non-literal-fs-filename.md)), that is, path traversal, where a request's input reaches a file path ([OWASP, Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)). Here no request input can reach the path: the server reads its TLS certificate and key once at start-up from `TLS_CERT_PATH` and `TLS_KEY_PATH` in its own `.env`, set by whoever deploys it. A literal path would tie the code to one server's layout (the deployment mounts the certificates at `/certs/...`).

- **Trivy:** any finding on a dependency is fixed by updating it (`npm audit fix`, or a newer version in `frontend/gradle/libs.versions.toml`) before the final run; one that cannot be updated is justified here with the advisory's own assessment.

---

## 3. Manual Code Review Results

### 3.1. Review You Performed

- **Peer group reviewed:** Fabricate (Nick Waterhouse-Currie, Evan Nawfal, Glen Zhu, Khai Phan)
- **Commit SHA reviewed:** `806591443242123301b911c90ae8b78649186610`
- **Date the artifacts were exchanged:** November 4, 2026
- **Review report submitted:** `CP3_Fabricate_Review.pdf`

| **Item** | **Score** |
| --- | --- |
| Code is maintainable, efficient, handles error cases well | 7/10 |
| Tests are complete for one end-to-end feature and all interfaces of one component, edge cases tested, correct assertions | 8/10 |
| Test code is maintainable and well-structured | 8/10 |
| Test implementation matches the requirements and design | 6/10 |
| Non-functional requirements are tested well | 5/10 |
| Tests achieve high coverage and gaps are well-justified | 8/10 |
| All back-end tests can be run automatically | 9/10 |
| Codacy runs with the required setup | 9/10 |
| All remaining Codacy issues are well-justified | 6/10 |

**Major fault (High):** no consent for friends or rooms, and unfriending keeps room access. `POST /friends` adds any registered email as a friend with no accept step and returns their name; the friend can then be put in a room they cannot leave, and after `DELETE /friends` they keep reading the room, posting, and getting signed links to the other user's clothing photos, because access only checks room membership.

### 3.2. Review You Received

- **Reviewing group:** Donut (Adriano Tessaro, Chengzhi (Chance) Yang, Elliot Shepherd, Evan Anderson)
- **Commit SHA that was reviewed:** `86b568c57cb1fac7c5393c09b821071e55f5483e`
- **Review report received:** `CP3_TimeTravel_Review.pdf`

| **Item** | **Score** |
| --- | --- |
| Code is maintainable, efficient, handles error cases well | 7.25/10 |
| Tests are complete for one end-to-end feature and all interfaces of one component, edge cases tested, correct assertions | 8.5/10 |
| Test code is maintainable and well-structured | 10/10 |
| Test implementation matches the requirements and design | 9.7/10 |
| Non-functional requirements are tested well | 8.7/10 |
| Tests achieve high coverage and gaps are well-justified | 9.5/10 |
| All back-end tests can be run automatically | 10/10 |
| Codacy runs with the required setup | 5/10 |
| All remaining Codacy issues are well-justified | 6/10 |

**Major fault (High):** a member removed from a group kept receiving the other members' live locations while the trip's map stayed open, because the server checked access only when a device subscribed to a trip's live updates (found by Evan Anderson).

### 3.3. Actions Taken in Response to the Review

Each change is a commit on `main` (named below by its subject) with tests.

| **Finding** | **Action** | **Where** |
| --- | --- | --- |
| Major fault: a removed member keeps receiving live locations | Fixed. When a member leaves or is removed, or the group is deleted, the server takes their devices out of the group's trips' live rooms, stops their location sharing and tells them (`tripAccessLost`); every shared position also checks access again. The app closes the trip and its map. | "fix: cut live updates as soon as a member loses access to a group trip"; "fix: close a trip and its map when the traveller leaves its group"; `backend/tests/no-mock/tripSync.test.ts` ("losing access to a group trip") |
| `insertAt` repeated in the planner and local search | One shared `insertAt` in `trips/engine/daySchedule.ts`. | "fix: address the peer review's code review of the back-end" |
| Too few comments in `dayRepair.ts` and `generateTrip` | Comments for `setLock`, `stopIndex`, `unpinnedCandidateFor` and `freePool`, and for each step of `generateTrip`. | same commit |
| Two saves of the same review at once can corrupt counts or fail with a duplicate key | A duplicate on create, or a version clash on edit (reviews now use optimistic concurrency), redoes the save as an edit; any other duplicate-key race is a 409, not a 500. | same commit; `backend/tests/mock/reviews.test.ts`, `backend/tests/no-mock/reviews.test.ts` |
| One failed city search throws away the rest | The searches that work are kept; only when all fail does the city's search fail. | same commit; `backend/tests/mock/activities.test.ts` |
| A failed venue-status check treats a closed venue as open | It keeps the venue's last known status. | same commit; `backend/tests/mock/suggestions.test.ts` |
| Long lines, and independent lookups awaited one after the other | Lines over 150 characters wrapped; the traveller profile's and the feed's independent lookups run in parallel. | same commit |
| Traveller routes could be their own service | Their own routes file (`friends/travellerRoutes.ts`). They still use the Friend Service, since it alone decides what of a traveller the caller may see. | same commit |
| "This group is full" for any failed join | Only when the group is full; joining twice at once joins once, and a group deleted meanwhile is 404. | same commit; `backend/tests/no-mock/groups.test.ts`, `backend/tests/mock/groups.test.ts` |
| Sign-in blames the user when Google is down or not configured | 503 "Google sign-in is unavailable right now". | same commit; `backend/tests/mock/auth.test.ts` |
| The id check is copied into 5 route files; `DUPLICATE_KEY_ERROR` defined twice; duplicate keys are 500 | One shared `objectIdOf` and `isDuplicateKeyError` (`backend/src/shared/mongo.ts`); the error handler answers duplicate keys with 409. | same commit |
| An expired session leaves the app showing errors | The app returns to sign-in with "Your session expired. Sign in again." | "fix: address the peer review's code review of the app" |
| The map retries a stale visit forever while offline | On a 409 it fetches the trip again before the next try. | same commit |
| Approximate location cannot tick stops off within 100 m | Stops are ticked off only from precise location, and the map says so. | same commit |
| The generate end-to-end test is one large test | Six tests: the main success scenario and one per failure scenario. | "test: split Plan Trip, make reviews unique, and time live updates on the phone" |
| The review end-to-end test can pass on an earlier run's review | Each run writes a review with its run time in it. | same commit |
| NFR 2 is not checked on the phone | An instrumented test times a change made elsewhere until it is gone from the open trip screen (at most 2 s; 185 ms in our run). | same commit; Testing.md section 3 |
| No test for an expired session or the 7-day lifetime | Both added. | "test: add the back-end tests the peer review asked for"; `backend/tests/no-mock/auth.test.ts` |
| The reviews list order (verified first, then newest) is not checked | Checked. | same commit; `backend/tests/no-mock/reviews.test.ts` |
| The Places-usage NFR test assumes Google works | Added an outage scenario. It showed that an expired city retried Google on every request, so a failed refresh now waits an hour before trying again. | same commit; `backend/tests/nfr/placesUsage.test.ts` |
| `parsePort` in `env.ts` is untested | Unit tests added. | same commit; `backend/tests/unit/env.test.ts` |
| Unit tests lack the comments the interface tests have | Every unit test has an Input / Expected behavior / Expected output header. | same commit |
| Codacy uses the default standard, with Opengrep | Codacy is configured with only detekt, ESLint and Trivy and the repository's configuration files (section 2). | section 2 |
| Justifications cite no sources; the Dockerfile one should be a fix | The Dockerfile now runs as a non-root user; every justification in 2.4 cites its sources. | "fix: address the peer review's code review of the back-end"; section 2.4 |
