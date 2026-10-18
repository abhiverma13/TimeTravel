# TimeTravel

Crowd-rated activities, scheduled into a trip that actually fits your days.

TimeTravel is an Android app (Kotlin, Jetpack Compose) with a Node.js and TypeScript back-end (Express, MongoDB). Travellers rate and tag the activities they have done; a visitor describes their trip, and TimeTravel's itinerary engine builds a day-by-day plan around opening hours, travel time and the traveller's pace. Requirements and design: [`documentation/Requirements_and_Design.md`](documentation/Requirements_and_Design.md). Tests: [`documentation/Testing.md`](documentation/Testing.md).

## Prerequisites

- Docker Desktop running, with `docker version` and `docker compose version` working (to run the back-end)
- Node.js 22 and npm 10 (to run the back-end tests)
- Android Studio, JDK 17+, and a Pixel 9 API 36 emulator named `Pixel_9`
- A Google Cloud project with:
  - an **OAuth web client** (its client ID is used by both the app and the back-end) and an **Android OAuth client** for package `com.example.cpen321application` with the SHA-1 of every key that signs the app (each developer's debug key and the release key). Find a key's SHA-1 with `keytool -list -v -keystore <keystore> -alias <alias>`; the debug key is `~/.android/debug.keystore`, alias `androiddebugkey`, password `android`.
  - the **Places API (New)** enabled and an API key for it (optional: without it, only cities already in the database can be browsed, see "Demo data" below).

## 1. Back-end

From the repository root, create the back-end configuration:

```powershell
Copy-Item backend\.env.example backend\.env      # Windows
cp backend/.env.example backend/.env             # macOS / Linux
```

Edit `backend/.env`:

| Variable | Value |
| --- | --- |
| `PORT` | `3000` locally; `443` on the cloud VM with HTTPS |
| `MONGODB_URI` | leave as is; Docker Compose points the back-end at its own MongoDB container |
| `GOOGLE_CLIENT_ID` | the OAuth **web** client ID |
| `JWT_SECRET` | a long random string, for example the output of `openssl rand -hex 32` |
| `GOOGLE_PLACES_API_KEY` | the Places API (New) key |
| `TLS_CERT_PATH`, `TLS_KEY_PATH` | blank locally; on the VM, the certificate and key paths inside the container (`/certs/...`, mounted from `backend/certs`) |

Start the back-end and its MongoDB:

```powershell
.\scripts\run-backend.ps1       # Windows
./scripts/run-backend.sh        # macOS / Linux
```

The script waits until `GET /health` answers. Stop everything with `docker compose down`.

### Demo data

To try the app without a Places API key, load the labelled Vancouver demo catalogue (30 activities with illustrative ratings and hours, not live Google data):

```
docker compose exec backend npm run seed:demo
```

## 2. Android app

Create `frontend/local.properties` (Android Studio usually writes `sdk.dir` for you):

```properties
sdk.dir=C:/Users/<username>/AppData/Local/Android/Sdk
API_BASE_URL=http://10.0.2.2:3000
GOOGLE_CLIENT_ID=<the OAuth web client ID>
```

`10.0.2.2` is the emulator's address for the development computer; the app allows plain HTTP only to that address and `localhost`. For the deployed back-end, set `API_BASE_URL=https://<server address>`.

Build, install and launch the app on the `Pixel_9` emulator:

```powershell
.\scripts\run-frontend.ps1      # Windows
./scripts/run-frontend.sh       # macOS / Linux
```

Sign in with Google. If sign-in reports "Sign-in was cancelled" immediately after choosing an account, the SHA-1 of the key that signed this build is missing from the Android OAuth client (see Prerequisites).

### Release APK

Add the release keystore to `frontend/local.properties` (the keystore path is relative to `frontend/`; never commit the keystore):

```properties
RELEASE_STORE_FILE=release.keystore
RELEASE_STORE_PASSWORD=<password>
RELEASE_KEY_ALIAS=<alias>
RELEASE_KEY_PASSWORD=<password>
```

Then build it with `cd frontend; .\gradlew.bat assembleRelease` (or `./gradlew assembleRelease`); the APK is `frontend/app/build/outputs/apk/release/app-release.apk`.

## 3. Tests

### Back-end

```powershell
.\scripts\run-backend-interface-tests.ps1   # back-end interface tests, with and without mocks, with coverage
.\scripts\run-backend-nfr-tests.ps1         # non-functional requirement tests
```

On macOS / Linux, run `./scripts/run-backend-interface-tests.sh` and `./scripts/run-backend-nfr-tests.sh`.

The back-end tests start their own in-memory MongoDB, so they need neither Docker nor a Places key. They also run in GitHub Actions on every push to `main` ([`.github/workflows/backend-tests.yml`](.github/workflows/backend-tests.yml)).

### Front-end

```powershell
.\scripts\run-frontend-e2e-tests.ps1   # end-to-end tests (frontend/app/src/androidTest/.../e2e)
.\scripts\run-frontend-nfr-tests.ps1   # non-functional requirement tests (frontend/app/src/androidTest/.../nfr)
```

On macOS / Linux, run `./scripts/run-frontend-e2e-tests.sh` and `./scripts/run-frontend-nfr-tests.sh`.

They need Docker running, `frontend/local.properties` set up as in section 2, and the `Pixel_9` emulator. Each script starts the back-end, installs and launches the app, and waits: sign in inside the app, then press Enter in the terminal to run the tests. A suite with no test files is skipped. The Generate Itinerary end-to-end test is designed in Testing.md and is implemented in CP2.

See [`documentation/Testing.md`](documentation/Testing.md) for details.

Do not commit `backend/.env`, `frontend/local.properties`, keystores or private keys.
