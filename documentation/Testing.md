# Testing

## 1. Change History

| **Change Date** | **Modified Sections** | **Rationale** |
| --------------- | --------------------- | ------------- |
| 2026-10-17 | All | First version for CP1: back-end interface tests for every API of the Auth & Profile Service, the Activity & Review Service and the Itinerary Engine; the first non-functional requirement test; and the end-to-end test design for Generate Itinerary. |
| 2026-10-26 | 2.1.1 | Added the Group Service interfaces (create, list, join, read, set preferences, remove a member, delete), tested with and without mocks, and group trips in the Itinerary Engine interfaces (`groupId` on generate and on the itinerary list). |
| 2026-10-26 | 2.1.1, 3 | Added `POST /api/itineraries/:itineraryId/adjust` and the Socket.io live-update interface, tested with and without mocks, and the NFR 2 (live update latency) test with its log. |
| 2026-10-26 | 2.1.1 | Added the trip options (way of getting around, budget, must-see and avoid places) to the `POST /api/itineraries/generate` tests, with Google Routes mocked and through the production Routes client, and the `add` action to the `POST /api/itineraries/:itineraryId/adjust` tests. |
| 2026-10-26 | 2.1.1 | Added the Friend Service interfaces (search and view travellers, list friends, send and accept requests, remove a friendship, set privacy), tested with and without mocks. |
| 2026-10-26 | 2.1.1 | Added the Feed Service interfaces (share, feeds, read, delete, like, unlike, comments, copy a shared trip), tested with and without mocks; the copy is also tested with Google Routes mocked. |
| 2026-10-26 | 2.1.1 | Added the `visit` and `unvisit` adjustments to the `POST /api/itineraries/:itineraryId/adjust` tests, and the Socket.io location-sharing interface, tested with and without mocks. |
| 2026-10-26 | 2.1.1 | Added the Nearby Service interfaces (open a trip, find nearby trips, ask to join, list, accept and decline requests), tested with and without mocks. |
| 2026-10-26 | 2.1.1 | Added verified reviews to the `POST /api/activities/:activityId/reviews` tests, and the new `GET /api/activities/:activityId/reviews` interface, tested with and without mocks. |
| 2026-10-26 | 2.1.1 | Added the disruption suggestion interfaces (list, accept, dismiss), the disruption timer (`checkActiveTrips`, with OpenWeather and Places mocked and through the production clients) and the Socket.io `suggestionAdded` push, tested with and without mocks. |
| 2026-10-26 | 2.1.1, 2.3-2.5, 3, 4 | Added three tests without mocks (driving times without Google Routes, adjusting a trip that avoids places, nearby trips nearest first) and regenerated the coverage reports; their uncovered line numbers now refer to the TypeScript source, as source maps are on in the back-end `tsconfig.json`. Added the NFR 3 (bounded Google Places usage) test and its log. Implemented the Generate Itinerary end-to-end test and added the Rate & Review Activity and View & Adjust Itinerary end-to-end tests, with their logs. |
| 2026-10-27 | 4.2 | The Generate Itinerary end-to-end test's unknown lodging is now "no such place zzzz": Google Places matched "zzzz no such hotel, Vancouver" to real Vancouver hotels, so the deployed back-end never warned that the lodging could not be found. |

---

## 2. Back-end Test Specification: APIs

### 2.1. Locations of Back-end Tests and Instructions to Run Them

#### 2.1.1. Tests

| **Interface** | **Describe Group Location, No Mocks** | **Describe Group Location, With Mocks** | **Mocked Components** |
| --- | --- | --- | --- |
| **POST /api/auth/google** | [`backend/tests/no-mock/auth.test.ts#L13`](../backend/tests/no-mock/auth.test.ts#L13) | [`backend/tests/mock/auth.test.ts#L29`](../backend/tests/mock/auth.test.ts#L29) | Google Identity Services (token verification), User DB |
| **GET /api/users/me** | [`backend/tests/no-mock/auth.test.ts#L60`](../backend/tests/no-mock/auth.test.ts#L60) | [`backend/tests/mock/auth.test.ts#L173`](../backend/tests/mock/auth.test.ts#L173) | User DB |
| **PUT /api/users/me** | [`backend/tests/no-mock/auth.test.ts#L153`](../backend/tests/no-mock/auth.test.ts#L153) | [`backend/tests/mock/auth.test.ts#L195`](../backend/tests/mock/auth.test.ts#L195) | User DB |
| **GET /api/activities** | [`backend/tests/no-mock/activities.test.ts#L22`](../backend/tests/no-mock/activities.test.ts#L22) | [`backend/tests/mock/activities.test.ts#L46`](../backend/tests/mock/activities.test.ts#L46), [`#L201`](../backend/tests/mock/activities.test.ts#L201) (through the production Google Places client) | Google Places API, Activity DB |
| **POST /api/activities/:activityId/reviews** | [`backend/tests/no-mock/reviews.test.ts#L56`](../backend/tests/no-mock/reviews.test.ts#L56) | [`backend/tests/mock/reviews.test.ts#L27`](../backend/tests/mock/reviews.test.ts#L27) | Review DB, Activity DB, City catalogue DB |
| **GET /api/activities/:activityId/reviews** | [`backend/tests/no-mock/reviews.test.ts#L314`](../backend/tests/no-mock/reviews.test.ts#L314) | [`backend/tests/mock/reviews.test.ts#L112`](../backend/tests/mock/reviews.test.ts#L112) | Review DB |
| **POST /api/groups** | [`backend/tests/no-mock/groups.test.ts#L23`](../backend/tests/no-mock/groups.test.ts#L23) | [`backend/tests/mock/groups.test.ts#L25`](../backend/tests/mock/groups.test.ts#L25) | Group DB (invite-code collisions, write failures) |
| **GET /api/groups** | [`backend/tests/no-mock/groups.test.ts#L73`](../backend/tests/no-mock/groups.test.ts#L73) | [`backend/tests/mock/groups.test.ts#L78`](../backend/tests/mock/groups.test.ts#L78) | Group DB |
| **POST /api/groups/join** | [`backend/tests/no-mock/groups.test.ts#L116`](../backend/tests/no-mock/groups.test.ts#L116) | [`backend/tests/mock/groups.test.ts#L97`](../backend/tests/mock/groups.test.ts#L97) | Group DB |
| **GET /api/groups/:groupId** | [`backend/tests/no-mock/groups.test.ts#L207`](../backend/tests/no-mock/groups.test.ts#L207) | [`backend/tests/mock/groups.test.ts#L118`](../backend/tests/mock/groups.test.ts#L118) | Group DB |
| **PUT /api/groups/:groupId/members/me** | [`backend/tests/no-mock/groups.test.ts#L245`](../backend/tests/no-mock/groups.test.ts#L245) | [`backend/tests/mock/groups.test.ts#L137`](../backend/tests/mock/groups.test.ts#L137) | Group DB (member removed during the update) |
| **DELETE /api/groups/:groupId/members/:userId** | [`backend/tests/no-mock/groups.test.ts#L304`](../backend/tests/no-mock/groups.test.ts#L304) | [`backend/tests/mock/groups.test.ts#L157`](../backend/tests/mock/groups.test.ts#L157) | Group DB |
| **DELETE /api/groups/:groupId** | [`backend/tests/no-mock/groups.test.ts#L377`](../backend/tests/no-mock/groups.test.ts#L377) | [`backend/tests/mock/groups.test.ts#L179`](../backend/tests/mock/groups.test.ts#L179) | Itinerary DB |
| **POST /api/itineraries/generate** | [`backend/tests/no-mock/itineraries.test.ts#L38`](../backend/tests/no-mock/itineraries.test.ts#L38) | [`backend/tests/mock/itineraries.test.ts#L37`](../backend/tests/mock/itineraries.test.ts#L37), [`#L198`](../backend/tests/mock/itineraries.test.ts#L198) (Google Routes travel times, cache and failures), [`#L284`](../backend/tests/mock/itineraries.test.ts#L284) (through the production Google Routes client) | Google Places API (lodging lookup), Google Routes API, Itinerary DB |
| **GET /api/itineraries/:itineraryId** | [`backend/tests/no-mock/itineraries.test.ts#L393`](../backend/tests/no-mock/itineraries.test.ts#L393) | [`backend/tests/mock/itineraries.test.ts#L136`](../backend/tests/mock/itineraries.test.ts#L136) | Itinerary DB |
| **GET /api/itineraries** | [`backend/tests/no-mock/itineraries.test.ts#L442`](../backend/tests/no-mock/itineraries.test.ts#L442) | [`backend/tests/mock/itineraries.test.ts#L157`](../backend/tests/mock/itineraries.test.ts#L157) | Itinerary DB |
| **POST /api/itineraries/:itineraryId/adjust** | [`backend/tests/no-mock/adjust.test.ts#L41`](../backend/tests/no-mock/adjust.test.ts#L41) | [`backend/tests/mock/adjust.test.ts#L32`](../backend/tests/mock/adjust.test.ts#L32) | Itinerary DB (a concurrent change saved first, write failure), Activity DB, live-update push |
| **Socket.io itinerary updates** | [`backend/tests/no-mock/tripSync.test.ts#L40`](../backend/tests/no-mock/tripSync.test.ts#L40) | [`backend/tests/mock/tripSync.test.ts#L19`](../backend/tests/mock/tripSync.test.ts#L19) | Itinerary DB (access check on subscribe) |
| **Socket.io location sharing** | [`backend/tests/no-mock/tripSync.test.ts#L144`](../backend/tests/no-mock/tripSync.test.ts#L144) | [`backend/tests/mock/tripSync.test.ts#L46`](../backend/tests/mock/tripSync.test.ts#L46) | User DB (looking up the sharer) |
| **Socket.io suggestions** | [`backend/tests/no-mock/tripSync.test.ts#L229`](../backend/tests/no-mock/tripSync.test.ts#L229) | [`backend/tests/mock/tripSync.test.ts#L75`](../backend/tests/mock/tripSync.test.ts#L75) | Suggestion push (a device that cannot be reached) |
| **GET /api/travellers** | [`backend/tests/no-mock/friends.test.ts#L37`](../backend/tests/no-mock/friends.test.ts#L37) | [`backend/tests/mock/friends.test.ts#L33`](../backend/tests/mock/friends.test.ts#L33) | User DB |
| **GET /api/travellers/:userId** | [`backend/tests/no-mock/friends.test.ts#L133`](../backend/tests/no-mock/friends.test.ts#L133) | [`backend/tests/mock/friends.test.ts#L51`](../backend/tests/mock/friends.test.ts#L51) | Friendship DB |
| **GET /api/friends** | [`backend/tests/no-mock/friends.test.ts#L186`](../backend/tests/no-mock/friends.test.ts#L186) | [`backend/tests/mock/friends.test.ts#L69`](../backend/tests/mock/friends.test.ts#L69) | Friendship DB |
| **POST /api/friends/requests** | [`backend/tests/no-mock/friends.test.ts#L236`](../backend/tests/no-mock/friends.test.ts#L236) | [`backend/tests/mock/friends.test.ts#L87`](../backend/tests/mock/friends.test.ts#L87) | Friendship DB (both travellers asking at the same moment, write failure) |
| **POST /api/friends/requests/:userId/accept** | [`backend/tests/no-mock/friends.test.ts#L292`](../backend/tests/no-mock/friends.test.ts#L292) | [`backend/tests/mock/friends.test.ts#L126`](../backend/tests/mock/friends.test.ts#L126) | Friendship DB |
| **DELETE /api/friends/:userId** | [`backend/tests/no-mock/friends.test.ts#L327`](../backend/tests/no-mock/friends.test.ts#L327) | [`backend/tests/mock/friends.test.ts#L145`](../backend/tests/mock/friends.test.ts#L145) | Friendship DB |
| **PUT /api/friends/privacy** | [`backend/tests/no-mock/friends.test.ts#L361`](../backend/tests/no-mock/friends.test.ts#L361) | [`backend/tests/mock/friends.test.ts#L164`](../backend/tests/mock/friends.test.ts#L164) | User DB |
| **POST /api/posts** | [`backend/tests/no-mock/posts.test.ts#L55`](../backend/tests/no-mock/posts.test.ts#L55) | [`backend/tests/mock/posts.test.ts#L54`](../backend/tests/mock/posts.test.ts#L54) | Post DB |
| **GET /api/posts** | [`backend/tests/no-mock/posts.test.ts#L144`](../backend/tests/no-mock/posts.test.ts#L144) | [`backend/tests/mock/posts.test.ts#L72`](../backend/tests/mock/posts.test.ts#L72) | Comment DB |
| **GET /api/posts/:postId** | [`backend/tests/no-mock/posts.test.ts#L238`](../backend/tests/no-mock/posts.test.ts#L238) | [`backend/tests/mock/posts.test.ts#L90`](../backend/tests/mock/posts.test.ts#L90) | Comment DB |
| **DELETE /api/posts/:postId** | [`backend/tests/no-mock/posts.test.ts#L275`](../backend/tests/no-mock/posts.test.ts#L275) | [`backend/tests/mock/posts.test.ts#L107`](../backend/tests/mock/posts.test.ts#L107) | Comment DB |
| **PUT /api/posts/:postId/like** | [`backend/tests/no-mock/posts.test.ts#L311`](../backend/tests/no-mock/posts.test.ts#L311) | [`backend/tests/mock/posts.test.ts#L125`](../backend/tests/mock/posts.test.ts#L125) | Post DB (post deleted while liking it) |
| **DELETE /api/posts/:postId/like** | [`backend/tests/no-mock/posts.test.ts#L345`](../backend/tests/no-mock/posts.test.ts#L345) | [`backend/tests/mock/posts.test.ts#L143`](../backend/tests/mock/posts.test.ts#L143) | Post DB |
| **GET /api/posts/:postId/comments** | [`backend/tests/no-mock/posts.test.ts#L365`](../backend/tests/no-mock/posts.test.ts#L365) | [`backend/tests/mock/posts.test.ts#L160`](../backend/tests/mock/posts.test.ts#L160) | Comment DB |
| **POST /api/posts/:postId/comments** | [`backend/tests/no-mock/posts.test.ts#L403`](../backend/tests/no-mock/posts.test.ts#L403) | [`backend/tests/mock/posts.test.ts#L177`](../backend/tests/mock/posts.test.ts#L177) | Comment DB |
| **DELETE /api/posts/:postId/comments/:commentId** | [`backend/tests/no-mock/posts.test.ts#L434`](../backend/tests/no-mock/posts.test.ts#L434) | [`backend/tests/mock/posts.test.ts#L194`](../backend/tests/mock/posts.test.ts#L194) | Comment DB |
| **POST /api/posts/:postId/copy** | [`backend/tests/no-mock/posts.test.ts#L472`](../backend/tests/no-mock/posts.test.ts#L472) | [`backend/tests/mock/posts.test.ts#L213`](../backend/tests/mock/posts.test.ts#L213) | Google Routes API, Itinerary DB |
| **PUT /api/nearby/trips/:itineraryId** | [`backend/tests/no-mock/nearby.test.ts#L52`](../backend/tests/no-mock/nearby.test.ts#L52) | [`backend/tests/mock/nearby.test.ts#L75`](../backend/tests/mock/nearby.test.ts#L75) | Itinerary DB |
| **GET /api/nearby/trips** | [`backend/tests/no-mock/nearby.test.ts#L110`](../backend/tests/no-mock/nearby.test.ts#L110) | [`backend/tests/mock/nearby.test.ts#L41`](../backend/tests/mock/nearby.test.ts#L41) | Itinerary DB, Group DB (a group deleted while listing) |
| **POST /api/nearby/trips/:itineraryId/requests** | [`backend/tests/no-mock/nearby.test.ts#L194`](../backend/tests/no-mock/nearby.test.ts#L194) | [`backend/tests/mock/nearby.test.ts#L92`](../backend/tests/mock/nearby.test.ts#L92) | Join request DB |
| **GET /api/nearby/requests** | [`backend/tests/no-mock/nearby.test.ts#L247`](../backend/tests/no-mock/nearby.test.ts#L247) | [`backend/tests/mock/nearby.test.ts#L109`](../backend/tests/mock/nearby.test.ts#L109) | Join request DB |
| **POST /api/nearby/requests/:requestId/accept** | [`backend/tests/no-mock/nearby.test.ts#L287`](../backend/tests/no-mock/nearby.test.ts#L287) | [`backend/tests/mock/nearby.test.ts#L126`](../backend/tests/mock/nearby.test.ts#L126) | Group DB (the group fills up first) |
| **POST /api/nearby/requests/:requestId/decline** | [`backend/tests/no-mock/nearby.test.ts#L345`](../backend/tests/no-mock/nearby.test.ts#L345) | [`backend/tests/mock/nearby.test.ts#L146`](../backend/tests/mock/nearby.test.ts#L146) | Join request DB |
| **GET /api/suggestions** | [`backend/tests/no-mock/suggestions.test.ts#L43`](../backend/tests/no-mock/suggestions.test.ts#L43) | [`backend/tests/mock/suggestions.test.ts#L151`](../backend/tests/mock/suggestions.test.ts#L151) | Suggestion DB |
| **POST /api/suggestions/:suggestionId/accept** | [`backend/tests/no-mock/suggestions.test.ts#L106`](../backend/tests/no-mock/suggestions.test.ts#L106) | [`backend/tests/mock/suggestions.test.ts#L181`](../backend/tests/mock/suggestions.test.ts#L181) | Itinerary DB (a change saved at the same moment), Suggestion DB |
| **POST /api/suggestions/:suggestionId/dismiss** | [`backend/tests/no-mock/suggestions.test.ts#L169`](../backend/tests/no-mock/suggestions.test.ts#L169) | [`backend/tests/mock/suggestions.test.ts#L217`](../backend/tests/mock/suggestions.test.ts#L217) | Suggestion DB |
| **Disruption timer: checkActiveTrips()** | [`backend/tests/no-mock/suggestions.test.ts#L191`](../backend/tests/no-mock/suggestions.test.ts#L191) | [`backend/tests/mock/suggestions.test.ts#L63`](../backend/tests/mock/suggestions.test.ts#L63), [`#L254`](../backend/tests/mock/suggestions.test.ts#L254) (through the production OpenWeather and Places clients) | OpenWeather API, Google Places API (business status), Suggestion DB |
| **GET /health** | [`backend/tests/no-mock/health.test.ts#L10`](../backend/tests/no-mock/health.test.ts#L10) | [`backend/tests/mock/health.test.ts#L11`](../backend/tests/mock/health.test.ts#L11) | MongoDB connection state |

The tests without mocks run against a real MongoDB (an in-memory server started by the tests, see `backend/tests/helpers/testDatabase.ts`) and pre-populate the Vancouver catalogue in the database, so they need no Google Places key. The Itinerary Engine's scheduling core is also unit-tested in [`backend/tests/unit/`](../backend/tests/unit/), including a comparison against a brute-forced optimum.

#### 2.1.2. Commit Hash Where Tests Run

`ceec5d99d70ad8d0d26c8d107e0d631a3d966fd9`

#### 2.1.3. Explanation on How to Run the Tests

1. **Clone the repository** and install the back-end dependencies (Node.js 22 and npm 10 are required; Docker is not needed for the tests):
   ```
   git clone https://github.com/abhiverma13/TimeTravel.git
   cd TimeTravel/backend
   npm ci
   ```
2. **Run the interface tests** (with mocks, without mocks, then combined, each with coverage) from the repository root:
   ```
   ./scripts/run-backend-interface-tests.sh      # or .\scripts\run-backend-interface-tests.ps1 on Windows
   ```
3. **Run the non-functional requirement tests**:
   ```
   ./scripts/run-backend-nfr-tests.sh            # or .\scripts\run-backend-nfr-tests.ps1 on Windows
   ```
4. **Run everything at once** (interface, unit and NFR tests): `cd backend && npm test`.

The first run downloads a MongoDB binary for the in-memory server (about 1 minute); later runs reuse it. Coverage reports are written to `backend/coverage/mock`, `backend/coverage/no-mock` and `backend/coverage/interface`.

### 2.2. GitHub Actions Configuration Location

[`.github/workflows/backend-tests.yml`](../.github/workflows/backend-tests.yml): on every push to `main` (and every pull request into `main`) it type-checks the back-end and runs the mocked, unmocked and combined interface tests with coverage, the unit tests and the NFR tests, and uploads the coverage reports as an artifact.

### 2.3. Jest Coverage Report Screenshots With Mocks

![Coverage with mocks](images/coverage_mock.png)

```
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|------------------
All files                |   81.78 |    58.86 |    78.8 |   83.73 |
  app.ts                 |     100 |       50 |     100 |     100 | 38
  activityModel.ts       |     100 |      100 |     100 |     100 |
  activityRoutes.ts      |     100 |       50 |     100 |     100 | 47
  activityService.ts     |   81.73 |    66.66 |   86.95 |   83.33 | 143,155-164,169-170,196,204,209-211,265
  communityScore.ts      |     100 |       80 |     100 |     100 | 25-26
  interests.ts           |     100 |    66.66 |     100 |     100 | 85-86
  openingHours.ts        |     100 |      100 |     100 |     100 |
  placesClient.ts        |     100 |    76.92 |     100 |     100 | 116-122,141
  reviewModel.ts         |      80 |       50 |     100 |      80 | 76,79,82,85
  reviewTags.ts          |   76.31 |    42.85 |   83.33 |   76.31 | 40-41,60-61,71,75-76,80,85
  authRoutes.ts          |     100 |       50 |     100 |     100 | 15
  authService.ts         |   73.52 |    42.85 |     100 |   73.52 | 50,53,60-63,73,76-79
  googleTokenVerifier.ts |     100 |      100 |     100 |     100 |
  userModel.ts           |      75 |      100 |   33.33 |   85.71 | 44
  env.ts                 |       0 |        0 |       0 |       0 | 1-16
  connection.ts          |   85.71 |      100 |   66.66 |   85.71 | 12
  disruptionRoutes.ts    |   93.75 |      100 |     100 |   93.75 | 30
  disruptionService.ts   |   92.74 |    88.73 |   92.59 |   93.22 | 188,204,226,229,232,235-237
  suggestionModel.ts     |     100 |      100 |     100 |     100 |
  weatherClient.ts       |     100 |    83.33 |     100 |     100 | 74
  friendRoutes.ts        |   97.14 |      100 |     100 |   97.05 | 67
  friendService.ts       |   61.17 |    43.18 |      60 |   65.82 | 61,64,67,90,96,102-108,115,131-132,144-147,153-154,160-163,183,189,200-202
  friendshipModel.ts     |     100 |      100 |     100 |     100 |
  groupModel.ts          |     100 |      100 |     100 |     100 |
  groupRoutes.ts         |   91.17 |      100 |   88.88 |   91.17 | 21,64,69
  groupService.ts        |    69.6 |    53.33 |   67.74 |   72.52 | 73-84,118,135,138,172,182,190,193,196,205,208-219,231,235,258
  dayRepair.ts           |   33.57 |    18.64 |    37.2 |   35.65 | 58-61,76-87,119,137-140,154,165-284,299-307
  itineraryModel.ts      |     100 |      100 |     100 |     100 |
  itineraryRoutes.ts     |   86.95 |       50 |   77.77 |   90.69 | 43,45,48,51
  itineraryService.ts    |    87.3 |    64.51 |   81.66 |   87.86 | 145-146,210-216,295,315,333-334,361-368,423,467,472,505,512,520,588,592
  routesClient.ts        |     100 |    92.85 |     100 |     100 | 70
  travelTimes.ts         |     100 |    85.71 |     100 |     100 | 90,105
  tripCalendar.ts        |     100 |       60 |     100 |     100 | 23
  tripOptions.ts         |     100 |       60 |     100 |     100 | 16
  visits.ts              |   77.77 |      100 |      50 |   77.77 | 11-14
  adjust.ts              |   68.42 |    66.66 |      50 |   72.22 | 16-20,37
  candidates.ts          |   85.71 |    70.83 |   92.85 |   87.09 | 40-44
  daySchedule.ts         |     100 |    92.85 |     100 |     100 | 59
  localSearch.ts         |     100 |    95.23 |     100 |     100 | 18
  planner.ts             |   97.36 |    79.31 |     100 |   97.14 | 16,20
  travelTime.ts          |   95.65 |       80 |     100 |   95.65 | 41
  types.ts               |     100 |      100 |     100 |     100 |
  authenticate.ts        |   76.47 |       50 |     100 |   76.47 | 12-13,19,28
  errorHandler.ts        |      64 |    46.15 |      60 |   66.66 | 20,26-27,34-36,39-40
  joinRequestModel.ts    |     100 |      100 |     100 |     100 |
  nearbyRoutes.ts        |     100 |      100 |     100 |     100 |
  nearbyService.ts       |   70.87 |    51.78 |   61.76 |   77.64 | 93-96,101,104,123,135-146,159,163,167,177,180-181,189,192,195,203
  postModel.ts           |     100 |      100 |     100 |     100 |
  postRoutes.ts          |   93.47 |       50 |     100 |   93.18 | 56,65,87
  postService.ts         |   78.16 |    52.63 |   81.25 |   82.27 | 107,127,145,155,166,169,180,187-188,202,205,222,232,247
  interestTags.ts        |     100 |      100 |     100 |     100 |
  tripSync.ts            |   61.97 |    39.28 |   47.36 |   63.76 | 63-64,83-84,88-89,98-106,130,136,140-144,150,154-156,161,166,169
```

### 2.4. Jest Coverage Report Screenshots Without Mocks

![Coverage without mocks](images/coverage_no_mock.png)

```
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|------------------
All files                |   91.14 |     74.5 |    92.8 |   90.81 |
  app.ts                 |     100 |       50 |     100 |     100 | 38
  activityModel.ts       |     100 |      100 |     100 |     100 |
  activityRoutes.ts      |     100 |      100 |     100 |     100 |
  activityService.ts     |   86.08 |    73.91 |   86.95 |   86.11 | 178,263,269-291
  communityScore.ts      |   93.33 |       50 |     100 |    92.3 | 34
  interests.ts           |     100 |       50 |     100 |     100 | 76-86
  openingHours.ts        |   92.85 |    91.66 |     100 |    92.3 | 31
  placesClient.ts        |   41.17 |        0 |       0 |   41.17 | 49-50,88-141
  reviewModel.ts         |     100 |      100 |     100 |     100 |
  reviewTags.ts          |     100 |    92.85 |     100 |     100 | 38
  authRoutes.ts          |     100 |      100 |     100 |     100 |
  authService.ts         |   94.11 |    92.85 |     100 |   94.11 | 31-36
  googleTokenVerifier.ts |   54.54 |    16.66 |     100 |   54.54 | 17,20-24
  userModel.ts           |     100 |      100 |     100 |     100 |
  env.ts                 |       0 |        0 |       0 |       0 | 1-16
  connection.ts          |     100 |      100 |     100 |     100 |
  disruptionRoutes.ts    |     100 |      100 |     100 |     100 |
  disruptionService.ts   |   83.06 |    56.33 |   88.88 |   83.05 | 79-80,134,151,173,211,249,259-263,274-285
  suggestionModel.ts     |     100 |      100 |     100 |     100 |
  weatherClient.ts       |       0 |        0 |       0 |       0 | 1-70
  friendRoutes.ts        |     100 |      100 |     100 |     100 |
  friendService.ts       |   96.47 |    86.36 |      96 |    96.2 | 51,127-128
  friendshipModel.ts     |     100 |      100 |     100 |     100 |
  groupModel.ts          |     100 |      100 |     100 |     100 |
  groupRoutes.ts         |     100 |      100 |     100 |     100 |
  groupService.ts        |   95.09 |    77.77 |   96.77 |    94.5 | 64,107-112,180
  dayRepair.ts           |   98.57 |    78.81 |     100 |   98.26 | 154,214
  itineraryModel.ts      |     100 |      100 |     100 |     100 |
  itineraryRoutes.ts     |     100 |      100 |     100 |     100 |
  itineraryService.ts    |    93.9 |    81.72 |     100 |   93.06 | 260,295,484,505,512,529,580,614-620
  routesClient.ts        |      44 |        0 |       0 |      44 | 18,36-37,52,57-83
  travelTimes.ts         |      46 |     23.8 |   46.15 |   48.88 | 50,67-69,80-109
  tripCalendar.ts        |     100 |       80 |     100 |     100 | 23
  tripOptions.ts         |     100 |      100 |     100 |     100 |
  visits.ts              |     100 |      100 |     100 |     100 |
  adjust.ts              |   94.73 |      100 |     100 |   94.44 | 18
  candidates.ts          |     100 |    95.83 |     100 |     100 | 26
  daySchedule.ts         |     100 |    92.85 |     100 |     100 | 59
  localSearch.ts         |     100 |    95.23 |     100 |     100 | 18
  planner.ts             |     100 |     86.2 |     100 |     100 | 45,73,139-141
  travelTime.ts          |     100 |       90 |     100 |     100 | 32
  types.ts               |     100 |      100 |     100 |     100 |
  authenticate.ts        |   94.11 |    83.33 |     100 |   94.11 | 28
  errorHandler.ts        |      84 |    84.61 |     100 |   83.33 | 26-27,42-43
  joinRequestModel.ts    |     100 |      100 |     100 |     100 |
  nearbyRoutes.ts        |     100 |      100 |     100 |     100 |
  nearbyService.ts       |   98.05 |    89.28 |   97.05 |   98.82 | 133
  postModel.ts           |     100 |      100 |     100 |     100 |
  postRoutes.ts          |     100 |      100 |     100 |     100 |
  postService.ts         |   98.85 |    94.73 |     100 |   98.73 | 178
  interestTags.ts        |     100 |      100 |     100 |     100 |
  tripSync.ts            |   90.14 |    89.28 |   84.21 |   89.85 | 73,94-96,136,144,150
```

Without mocks, the clients of the external services are not reached: Google Places (`placesClient.ts`), Google Routes (`routesClient.ts`, and the routed part of `travelTimes.ts`), OpenWeather (`weatherClient.ts`, and the forecast checks in `disruptionService.ts`) and the success path of Google token verification. Real calls need API keys and a real Google ID token, which the tests cannot obtain. Those paths, and database failures, are covered by the tests with mocks.

The "Uncovered Line #s" columns refer to lines of the TypeScript source (the back-end `tsconfig.json` has source maps on, so Jest maps coverage back to the `.ts` files).

### 2.5. Jest Coverage Report Screenshots With and Without Mocks Combined

![Coverage with and without mocks](images/coverage_interface.png)

```
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|------------------
All files                |   98.94 |    88.76 |    98.8 |   98.91 |
  app.ts                 |     100 |      100 |     100 |     100 |
  activityModel.ts       |     100 |      100 |     100 |     100 |
  activityRoutes.ts      |     100 |      100 |     100 |     100 |
  activityService.ts     |     100 |     88.4 |     100 |     100 | 52-56,194,211,286
  communityScore.ts      |     100 |       80 |     100 |     100 | 25-26
  interests.ts           |     100 |    66.66 |     100 |     100 | 85-86
  openingHours.ts        |     100 |      100 |     100 |     100 |
  placesClient.ts        |     100 |    76.92 |     100 |     100 | 116-122,141
  reviewModel.ts         |     100 |      100 |     100 |     100 |
  reviewTags.ts          |     100 |    92.85 |     100 |     100 | 38
  authRoutes.ts          |     100 |      100 |     100 |     100 |
  authService.ts         |     100 |    92.85 |     100 |     100 | 48
  googleTokenVerifier.ts |     100 |      100 |     100 |     100 |
  userModel.ts           |     100 |      100 |     100 |     100 |
  env.ts                 |       0 |        0 |       0 |       0 | 1-16
  connection.ts          |     100 |      100 |     100 |     100 |
  disruptionRoutes.ts    |     100 |      100 |     100 |     100 |
  disruptionService.ts   |     100 |    94.36 |     100 |     100 | 98,162-163,277
  suggestionModel.ts     |     100 |      100 |     100 |     100 |
  weatherClient.ts       |     100 |    83.33 |     100 |     100 | 74
  friendRoutes.ts        |     100 |      100 |     100 |     100 |
  friendService.ts       |     100 |    97.72 |     100 |     100 | 169
  friendshipModel.ts     |     100 |      100 |     100 |     100 |
  groupModel.ts          |     100 |      100 |     100 |     100 |
  groupRoutes.ts         |     100 |      100 |     100 |     100 |
  groupService.ts        |     100 |    91.11 |     100 |     100 | 122,219,242-252
  dayRepair.ts           |   98.57 |    78.81 |     100 |   98.26 | 154,214
  itineraryModel.ts      |     100 |      100 |     100 |     100 |
  itineraryRoutes.ts     |     100 |      100 |     100 |     100 |
  itineraryService.ts    |   98.47 |    90.32 |     100 |   98.26 | 295,505,512
  routesClient.ts        |     100 |    92.85 |     100 |     100 | 70
  travelTimes.ts         |     100 |    85.71 |     100 |     100 | 90,105
  tripCalendar.ts        |     100 |       80 |     100 |     100 | 23
  tripOptions.ts         |     100 |      100 |     100 |     100 |
  visits.ts              |     100 |      100 |     100 |     100 |
  adjust.ts              |   94.73 |      100 |     100 |   94.44 | 18
  candidates.ts          |     100 |    95.83 |     100 |     100 | 26
  daySchedule.ts         |     100 |    92.85 |     100 |     100 | 59
  localSearch.ts         |     100 |    95.23 |     100 |     100 | 18
  planner.ts             |     100 |     86.2 |     100 |     100 | 45,73,139-141
  travelTime.ts          |     100 |       90 |     100 |     100 | 32
  types.ts               |     100 |      100 |     100 |     100 |
  authenticate.ts        |   94.11 |    83.33 |     100 |   94.11 | 28
  errorHandler.ts        |      92 |     92.3 |     100 |   91.66 | 26-27
  joinRequestModel.ts    |     100 |      100 |     100 |     100 |
  nearbyRoutes.ts        |     100 |      100 |     100 |     100 |
  nearbyService.ts       |   99.02 |    91.07 |   97.05 |     100 | 71,99,131,135-141
  postModel.ts           |     100 |      100 |     100 |     100 |
  postRoutes.ts          |     100 |      100 |     100 |     100 |
  postService.ts         |     100 |    97.36 |     100 |     100 | 113
  interestTags.ts        |     100 |      100 |     100 |     100 |
  tripSync.ts            |   95.77 |    96.42 |   84.21 |   95.65 | 136,144,150
```

**Why the combined coverage is below 100%:**

- **`src/config/env.ts` (0%)**: it reads the environment variables once when the server process starts and is only imported by `src/index.ts`, the start-up file excluded from coverage. The interface tests build the app with explicit test configuration (see `backend/tests/helpers/testApp.ts`) so they do not depend on a developer's `.env`; `env.ts` runs every time the server starts with `scripts/run-backend.*`.
- **`src/itineraries/itineraryService.ts` line 295**: a guard for a planned stop whose activity is not among the candidates. The engine only schedules the candidates it is given, so this cannot happen; the guard exists because TypeScript's `Map.get` may return `undefined`.
- **`src/itineraries/itineraryService.ts` lines 505 and 512, and `src/itineraries/dayRepair.ts` line 154**: when the disruption timer asks for a replacement, the proposal is dropped if the stop left the day between the timer's check and the proposal (a member edited the trip at that very moment), or if the rest of the day no longer fits without the stop (line 154, which `proposeReplacement` turns into line 512). Taking a stop out of a day that fits always leaves a day that fits, because every remaining stop can be reached at the same time or sooner as long as travel times obey the triangle inequality. Our estimated travel times always do; only Google Routes times could break it (a detour faster than the direct trip). Both are race or data guards that keep the timer from failing; they cannot be produced reliably through the API.
- **`src/itineraries/dayRepair.ts` line 214**: the tie-break when adding a place to a full day, and two ways of making room drop stops of exactly the same value; the one with less travel wins. A stop's value comes from its rating, number of ratings and interests, so a tie needs two places identical in all of them.
- **`src/itineraries/engine/adjust.ts` line 18**: while re-planning a day, a reordering of the filled day ends it sooner and the freed time is offered to another activity. Greedy insertion already puts each stop where it costs the least travel, so the short days in the interface tests never improve by reordering; the reorder step itself is covered by the engine's unit tests ([`backend/tests/unit/localSearch.test.ts`](../backend/tests/unit/localSearch.test.ts) and [`dayRepair.test.ts`](../backend/tests/unit/dayRepair.test.ts)).
- **`src/sync/tripSync.ts` lines 136, 144 and 150**: `.catch` handlers on the Socket.io event handlers. Subscribing and sharing a location catch their own errors and answer the device (tested with mocks), and leaving a room cannot fail with Socket.io's in-memory adapter, so these only log an unexpected bug instead of letting an unhandled promise rejection stop the server.
- **`src/nearby/nearbyService.ts` (99% of statements)**: the default clock in the constructor. The tests give every service their own clock (see `backend/tests/helpers/testApp.ts`) so dates are predictable; the running server uses the default.
- **`src/middleware/errorHandler.ts` lines 26-27**: hands an error to Express's default handler if a response was already partly sent. No route writes a response before failing, so this cannot be reached through the API; it is the error-handling pattern from the Express documentation.
- **`src/middleware/authenticate.ts` line 28**: rejects a request if a protected route is reached without the session middleware. Every protected router installs `requireSession`, so this is a defensive check.
- **Remaining branch gaps** (for example `interests.ts` 85-86, `placesClient.ts` 116-122, `weatherClient.ts` 74, `tripCalendar.ts` 23, the engine files): default values in destructuring and `??` fallbacks for fields Google Places, Google Routes or OpenWeather may omit, which TypeScript's strict null checks require even where the data always has them.

---

## 3. Tests of Non-Functional Requirements

### 3.1. Test Locations in Git

| **Non-Functional Requirement** | **Location in Git** |
| --- | --- |
| **NFR 1: Itinerary generation time** | [`backend/tests/nfr/itineraryGenerationTime.test.ts`](../backend/tests/nfr/itineraryGenerationTime.test.ts) |
| **NFR 2: Live update latency** | [`backend/tests/nfr/liveUpdateLatency.test.ts`](../backend/tests/nfr/liveUpdateLatency.test.ts) |
| **NFR 3: Bounded Google Places usage** | [`backend/tests/nfr/placesUsage.test.ts`](../backend/tests/nfr/placesUsage.test.ts) |

### 3.2. Test Verification and Logs

- **NFR 1: Itinerary generation time**

  - **Verification:** The test loads the 30-activity Vancouver catalogue plus 30 synthetic downtown activities, so pruning still leaves the maximum of 40 candidates, then sends 20 consecutive `POST /api/itineraries/generate` requests for a 5-day trip (08:00 to 21:00 days, packed pace, all interests) through the real Express app and an in-memory MongoDB. It measures each request from send to response, which includes reading the catalogue, the engine's solve and saving the itinerary, and asserts that the 95th percentile is under 3,000 ms. It also checks that every response is 201 with 5 days and that the engine really saw 40 candidates.
  - **Log Output**
    ```
    ==> Running backend NFR tests (tests/nfr/) ...
      console.info
        NFR itinerary generation: 20 runs, 5 days, 40 candidates, 33 stops
        p50 345 ms, p95 416 ms, max 457 ms (limit 3000 ms)

    Test Suites: 1 passed, 1 total
    Tests:       1 passed, 1 total
    ==> Backend NFR tests finished.
    ```

- **NFR 2: Live update latency**

  - **Verification:** The test creates a 4-member group with a 3-day packed Vancouver group trip, serves the app and its Socket.io hub on a local port, and subscribes the three other members' clients to the trip. The owner then sends 20 adjustments through `POST /api/itineraries/:itineraryId/adjust`, alternating the cheapest change (lock or unlock a stop) with the most expensive (re-planning a whole day). For each one it measures, per member, the time from sending the request to that member's client receiving `itineraryUpdated`, so the measurement includes the re-plan, the database write and the push. The test passes only if every one of the 60 deliveries takes under 2,000 ms.
  - **Log Output**
    ```
    ==> Running backend NFR tests (tests/nfr/) ...
      console.info
        NFR live update latency: 20 adjustments x 3 other members = 60 deliveries
        p50 53 ms, p95 77 ms, max 98 ms (limit 2000 ms)
    ```

- **NFR 3: Bounded Google Places usage**

  - **Verification:** The test serves the real Express app and an in-memory MongoDB with a fake Google Places client that returns the Vancouver catalogue and counts every call, and a server clock the test moves forward. Two travellers search Vancouver four times a day (all activities, and by interest) and generate a 2-day Vancouver itinerary once a day, for 6 days. The clock then passes the 7-day mark and one more search is made, and finally an itinerary is generated with a lodging. The test asserts that the first search makes exactly one text search per interest tag (7), that the 6 days of searching and planning make none, that the search after 7 days refreshes the city with 7 more, and that an entered lodging adds exactly 1. It also checks that every search and generation succeeds.
  - **Log Output**
    ```
    ==> Running backend NFR tests (tests/nfr/) ...
      console.info
        NFR Places usage: 7 calls for the first fetch; 0 more over 6 days of 24 searches and 6 generations; 7 for the refresh after 7 days; 1 for a lodging lookup

    Test Suites: 3 passed, 3 total
    Tests:       3 passed, 3 total
    ==> Backend NFR tests finished.
    ```

---

## 4. Front-end Test Specification

### 4.1. Location in Git of Front-end Test Suite:

[`frontend/app/src/androidTest/java/com/example/cpen321application/e2e/`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/)

There is one test class per use case. The steps they share (waiting for the back-end, choosing dates in the date picker, choosing a time, scrolling a list) are in [`androidTest/.../testing/E2eTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/testing/E2eTest.kt), outside the `e2e` folder so the course script does not run it as a test.

The app tags the elements these tests use with stable test tags ([`ui/common/TestTags.kt`](../frontend/app/src/main/java/com/example/cpen321application/ui/common/TestTags.kt)), so the tests depend on wording only where the wording is what they check. As the course requires, each test starts on the home screen with a signed-in user and runs against the real back-end, without mocks. Each test creates any trip it needs, so it does not depend on what the account already holds. Dates are computed from the day the tests run.

**How to run them**: start the back-end and the emulator, then run `./scripts/run-frontend-e2e-tests.sh` (or `.\scripts\run-frontend-e2e-tests.ps1` on Windows) from the repository root, sign in inside the app when prompted, and press Enter. The script runs `:app:connectedDebugAndroidTest` for every class in the `e2e` folder. One test can also be run from Android Studio, or, with the app and test APKs installed, with `adb shell am instrument -w -e class com.example.cpen321application.e2e.<TestClass> com.example.cpen321application.test/androidx.test.runner.AndroidJUnitRunner`, which is how the logs below were captured (on a Pixel 9 emulator, Android 16).

### 4.2. Tests

- **Use Case: Generate Itinerary** ([formal specification](Requirements_and_Design.md#uc3)): [`GenerateItineraryTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/GenerateItineraryTest.kt)

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The organizer taps "Plan a trip" on the home screen. | Click the node tagged `homePlanTrip`. |
    | 2. The app shows the Trip Builder, with the destination prefilled from the home city and the interests from the profile. | Check the node tagged `tripCityField` is displayed. Check the button tagged `generateButton` with text "Generate itinerary" is displayed. |
    | 3a. The destination is empty. | Clear `tripCityField`. Click `generateButton`. |
    | 3a1. The app shows "Enter a destination city." and does not generate. | Check `tripError` has text "Enter a destination city.". Check the Trip Builder is still displayed. |
    | 3b. No dates are chosen. | Type "Vancouver" in `tripCityField`. Click `generateButton`. |
    | 3b1. The app shows "Choose your trip dates." and does not generate. | Check `tripError` has text "Choose your trip dates.". |
    | 3c. The trip is longer than 7 days. | Click `tripDatesButton`. In the date picker, choose a start date and an end date 8 days later (dates are computed from today). Click "Done". Click `generateButton`. |
    | 3c1. The app shows "Trips can be at most 7 days." and does not generate. | Check `tripError` has text "Trips can be at most 7 days.". |
    | 3. The organizer enters the destination city and chooses the trip dates. | Click `tripDatesButton`. Choose a start date 7 days from today and an end date 9 days from today. Click "Done". Check `tripDatesButton` shows "3 days". |
    | 4a. The day ends less than 2 hours after it starts. | Open the "Start" dropdown and choose 17:00. Click `generateButton`. |
    | 4a1. The app shows "Your day must end at least 2 hours after it starts." and does not generate. | Check `tripError` has text "Your day must end at least 2 hours after it starts.". Open the "Start" dropdown and choose 09:00. |
    | 4. The organizer optionally changes the day times, arrival and departure, lodging, interests and pace. | Open the "Arrive" dropdown and choose 13:00. Click the "Museums" chip. Click the "Relaxed" segment. |
    | 5. The organizer taps "Generate itinerary". | Click `generateButton`. |
    | 6. The system ranks and schedules the city's activities into each day. | Wait until a node tagged `itineraryDay` is displayed (up to 10 s). |
    | 7. The app shows the itinerary as a day-by-day timeline. | Wait until a stop's "HH:MM to HH:MM" line (inside a node tagged `itineraryStop`) is displayed. Check the first day's first stop starts at or after 13:00. Scroll the timeline to the text "Back at lodging by", then to the headings "Day 1 of 3", "Day 2 of 3" and "Day 3 of 3". |
    | 6b. The lodging cannot be found. | Go back to home, click `homePlanTrip`, replace the text in `tripCityField` with "Vancouver", choose the same dates, type "no such place zzzz" in `tripLodgingField`, click `generateButton`. |
    | 6b1-6b2. The system plans from the city centre and the itinerary shows a warning. | Wait until a node tagged `itineraryWarning` is displayed. Check the text inside it contains "Could not find". Check the text "From Vancouver centre" is displayed. |

    Failure scenario 6a (no activities for the city) needs a city the back-end cannot find activities for, and 6d (TimeTravel unreachable) needs the back-end to be stopped; both are verified manually, because the front-end tests run against the real deployed back-end without mocks.

  - **Test Logs:**
    ```
    $ adb shell am instrument -w -e class com.example.cpen321application.e2e.GenerateItineraryTest com.example.cpen321application.test/androidx.test.runner.AndroidJUnitRunner

    com.example.cpen321application.e2e.GenerateItineraryTest:.

    Time: 16.875

    OK (1 test)
    ```

- **Use Case: Rate & Review Activity** ([formal specification](Requirements_and_Design.md#uc2)): [`RateReviewActivityTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/RateReviewActivityTest.kt)

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. On an activity's card in Explore & review, the traveller taps Rate. | Click the tab tagged `tabExplore`. Replace the text in `exploreCityField` with "Vancouver" and click `exploreSearchButton`. Wait until a node tagged `activityCard` is displayed (up to 10 s) and read the first card's activity name. Click the first `rateButton`. |
    | 2. The app opens a rating dialog with five stars, a review field and optional tag choices. Submit is disabled. | Check the text "Rate <activity>" is displayed. Check `submitRatingButton` is not enabled. |
    | 4b. The traveller taps Cancel. | Click "Cancel". |
    | 4b1. The dialog closes and nothing is saved. | Wait until `submitRatingButton` no longer exists. Click the first `rateButton` again. |
    | 3. The traveller selects a star rating. Submit becomes enabled. | Click `ratingStar4`. Check `submitRatingButton` is enabled. |
    | 4a. The traveller types more than 500 characters. | Type 520 characters into `reviewField`. |
    | 4a1. The review field stops accepting characters at 500. | Check `reviewField` holds exactly 500 characters. |
    | 4. The traveller optionally writes a review and selects tags, then taps Submit. | Replace the text in `reviewField` with "Great views, worth the walk.". Click the "Morning" and "Outdoor" chips. Click `submitRatingButton`. |
    | 5. The system saves the review and recomputes the activity's community score and tags. | Wait until the text "Thanks! Your review of <activity> was saved." is displayed (up to 25 s, which allows the app to read the device's location first). |
    | 6. The app closes the dialog, updates the activity's card and shows the confirmation. | Wait until `submitRatingButton` no longer exists. Click the `reviewsButton` on the card of <activity>. Check "Reviews of <activity>" and "Great views, worth the walk." are displayed. Click "Close". |

    Failure scenarios 5a (the activity no longer exists) and 5b (TimeTravel cannot be reached) need the activity deleted while the dialog is open, or the back-end stopped. The front-end tests run against the real back-end without mocks, so they cannot cause these; the back-end interface tests cover them (404 for a missing activity, and database failures with mocks).

  - **Test Logs:**
    ```
    $ adb shell am instrument -w -e class com.example.cpen321application.e2e.RateReviewActivityTest com.example.cpen321application.test/androidx.test.runner.AndroidJUnitRunner

    com.example.cpen321application.e2e.RateReviewActivityTest:.

    Time: 13.368

    OK (1 test)
    ```

- **Use Case: View & Adjust Itinerary** ([formal specification](Requirements_and_Design.md#uc4)): [`ViewAdjustItineraryTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/ViewAdjustItineraryTest.kt)

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | (Set-up: a trip to adjust.) | Click `homePlanTrip`. Replace the text in `tripCityField` with "Vancouver". Choose a start date 10 days from today and an end date a day later. Open the "Start" dropdown and choose 11:00. Click `generateButton`, wait until a node tagged `itineraryDay` is displayed, and go back to home. |
    | 1. The traveller opens a trip from the home screen's recent trips. | Click the first node tagged `recentTrip` (the newest trip). |
    | 2. The app shows the itinerary timeline, connects to the trip's live updates and shows "Live". | Wait until `liveStatus` contains "LIVE:" and a stop's "HH:MM to HH:MM" line is displayed. Read the first two stops' names (from their menu buttons, "Options for <stop>") and the first stop's times. |
    | 3. The traveller opens a stop's menu and locks it. | Click the first `stopActionsButton`, then `stopActionLock`. |
    | 4-5. The system re-plans; locked stops keep their times, and the traveller's app shows the change. | Wait until a node tagged `stopLocked` is displayed. Check the first stop's times are unchanged. |
    | 4a. No feasible plan keeps the requested change. | Click the second `stopActionsButton`, then `stopActionMoveEarlier`. (The second stop would have to fit before the locked first stop, which starts as soon as the day does.) |
    | 4a1. The app explains why and keeps the previous plan. | Wait until the text "<second stop> cannot go there" is displayed. Check the first two stops are still <first stop> and <second stop>. |
    | 3. The traveller removes a stop. | Click the second `stopActionsButton`, then `stopActionRemove`. |
    | 4-5. The removed stop's time goes to another activity; locked stops keep their times. | Wait until no button "Options for <second stop>" exists. Check the first stop is still <first stop>, with the same times. |
    | 3. The traveller unlocks a stop. | Click the first `stopActionsButton`, then `stopActionLock` (now "Unlock"). |
    | 4-5. The stop is no longer locked. | Wait until no node tagged `stopLocked` exists. |

    Step 5 for the other members (their apps show the change within 2 seconds) needs a second device; the back-end Socket.io interface tests and the NFR 2 test cover it. Failure scenarios 2a (the itinerary is missing or the traveller is not in its group), 2b (the live connection is lost) and 4b (another member changed the trip first) need a second account, a lost network or a concurrent edit; the back-end interface tests cover their server side (404, the live connection, and 409 for an out-of-date version).

  - **Test Logs:**
    ```
    $ adb shell am instrument -w -e class com.example.cpen321application.e2e.ViewAdjustItineraryTest com.example.cpen321application.test/androidx.test.runner.AndroidJUnitRunner

    com.example.cpen321application.e2e.ViewAdjustItineraryTest:.

    Time: 10.745

    OK (1 test)
    ```
