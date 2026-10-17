# RiceBook Live

A full-stack social application extended from Ye Wu's COMP 531 HW7: persistent feeds, comments, profiles and following, now connected to realtime discussion rooms.

**Stack:** Angular 20 + TypeScript · Node.js / Express · MongoDB / Mongoose · Socket.IO.

## Run locally

Requires Node.js 22.12+ (verified here with Node 24), npm, and internet access for the first installation.

Terminal 1:
```sh
cd backend
npm ci
npm run demo
```
The demo starts a real local MongoDB process, persists records under `backend/.demo-db`, and creates three fictional users. On its first run it downloads MongoDB from the official distribution. It never connects to the original HW7 cloud database.

Terminal 2:
```sh
cd frontend
npm ci
npm start -- --host localhost --port 4200
```
Open http://localhost:4200. Login as **alex**, **maya**, or **jordan**, password **CampusDemo2026!**. These are public local demo credentials; do not use the demo database or accounts as a production deployment.

For a separately managed MongoDB instance, copy `backend/.env.example` to `backend/.env`, configure `MONGO_URL`, and run `npm start` in `backend` instead. Frontend and API origins must match the configured `FRONTEND_ORIGIN` (default `http://localhost:4200`).

## Try the combined workflow

1. Login → see the existing HW7 feed and following list.
2. Click **Discuss in a room** below a post.
3. Create a public or private room, or select **Project studio**.
4. Click **Share post here**; the post excerpt becomes a persistent room message.
5. Send messages. In a separate browser profile, login as another demo user and open the same room.
6. Refresh or reconnect, reopen the room and recover the saved history.
7. As room owner, invite an existing username or remove a member. Private invitations appear in the recipient's Rooms list after refresh.

## What is inherited and what is new

| HW7 foundation retained | Additions inspired by the chat project |
|---|---|
| Angular standalone components and lazy routes | Lazy-loaded chat component and Socket.IO service |
| Express APIs and Mongoose models | Room/message models and membership-scoped APIs |
| Feed, comments, profiles and following | Public/private rooms, owner invitations and member removal |
| Local login and optional Google OAuth | Shared authentication for HTTP and realtime connections |
| MongoDB persistence | Persistent, paginated message history and unique retry IDs |

The Java/React `softdoc-team4sec2` project informed the feature selection. Its source was **not copied** into this project. The implementation extends the user's HW7 code directly. Do not describe the original team project as sole-authored work.

## Verification

```sh
cd backend
npm run test:integration
# 33 integration tests; isolated local MongoDB, no live external service

cd ../frontend
npm test -- --watch=false --browsers=ChromeHeadless
# 25 current regression tests; Chrome must be installed
npm run build
```
The new integration suite covers session validation, login input validation, private access, owner invitations, concurrent capacity checks, authenticated sockets, multi-client delivery, duplicate retries, history pagination, post-to-room sharing, membership removal, logout, and password-change revocation. The obsolete JSONPlaceholder-era frontend tests were replaced with 25 current regression tests (all pass). Historical HW5 coverage percentages are not current verification.

Browser verification: login → feed → discuss post → open room → share post → send message → reopen history; desktop and 390px mobile checked with the in-app browser. Production build succeeds; inherited initial bundle budget and new component CSS warning budgets are exceeded slightly (not hard build limits).

## Boundaries

- Single API process; presence and message-rate counters are process-local. Redis adapter and shared throttling would be needed for horizontal scaling.
- No claim of exactly-once network delivery. Database uniqueness and client-side deduplication make retries idempotent; reconnect reloads the most recent history page.
- A copied shared-post excerpt is visible to room members, including users outside the author's original following feed. The user explicitly chooses to share it.
- Google OAuth is optional; five mock-provider protocol tests pass and real Google account sign-in has been verified locally, including refresh and chat access. The local app now uses MongoDB Atlas; real Google login and chat history recovery were also verified against Atlas. Hosted Google callback, login and session refresh are verified. Old MD5 passwords are not migrated; this version uses a clean database and scrypt.
- Profile edits are server-validated and submitted atomically. Password changes persist and revoke sessions. Private contact fields are restricted to the owner. Feed post IDs and comment IDs use atomic counters; feed reads are bounded at 500 records and still use local UI pagination. Embedded comments remain a scaling limitation. Image upload controls were removed from the feed because the original backend did not support them.
- Production package audit reports zero advisories at verification time. The inherited Karma development/test toolchain still reports six high-severity advisories; do not expose its development server publicly.
- Local benchmarks are measured and documented: 10/50 concurrent clients, three repetitions each. This is not a claim of hosted capacity, real users, or availability/SLA. A Docker production build and restart smoke test pass; the app is deployed on Render at https://ricebook-live.onrender.com. Hosted smoke checks pass; hosted capacity is not measured.

See [architecture and interview notes](docs/ARCHITECTURE.md) and [resume wording](docs/RESUME.md).

Deployment and OAuth setup: [deployment runbook](docs/DEPLOYMENT.md), [Google login guide](docs/GOOGLE_LOGIN.md). Verification details: [current results](docs/VERIFICATION.md), [local benchmark](docs/BENCHMARK.md).

## Live demo

[Open RiceBook Live](https://ricebook-live.onrender.com). Free Render instances may sleep when idle.
