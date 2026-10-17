# Verification status

| Area | Status | Evidence / limit |
|---|---|---|
| Backend regression | PASS | 33 tests, isolated MongoDB and local HTTP/WebSocket services |
| Angular regression | PASS | 25 tests, Chrome Headless 155 |
| Production frontend build | PASS | Initial bundle and chat CSS warning budgets exceeded; hard build limits pass |
| Docker production image | PASS | Multi-stage build, production dependencies, non-root runtime |
| Container restart smoke | PASS | SPA deep links, Secure/HttpOnly cookies, real socket message, sessions/history survive app restart |
| Local realtime load | PASS | 10 and 50 clients, 3 runs each; all intended writes/fanout verified |
| Browser workflow | PASS | Login, create post, comment, refresh comment, profile update/refresh, server logout; feed-to-chat sharing/send checked |
| Responsive chat | PASS | Desktop and 390px layout checked; no horizontal overflow at 390px |
| Google OAuth protocol | PASS (mock only) | 5 tests of real Passport flow with a local fake provider |
| Real Google account sign-in | PASS locally and hosted | Real Google callback on HTTPS Render URL; authenticated feed and chat; session and history survive refresh |
| MongoDB Atlas | PASS | Free Cluster0 resumed; scoped application user; backend readiness ping; real Google login, room/message writes and history recovery after browser refresh verified against Atlas |
| Live cloud deployment | PASS smoke | Render HTTPS, /ready Atlas ping, HTML deep links, real Google login, feed post, realtime send and message recovery after refresh verified |
| Hosted load / real user traffic | NOT MEASURED | Local results are not production-capacity claims |

## Regression fixes

- Server logout revokes the cookie session; UI does not pretend logout succeeded on a server failure.
- Password updates now persist, validate bounds and revoke sessions instead of silently doing nothing.
- Profile fields are all validated before a single atomic update; private contact fields are owner-only.
- Avatar constraints match on both sides (500KB raster image picker; bounded server data URLs).
- Following rejects missing users and self-follow, and uses atomic set operations.
- Concurrent article/comment creation uses atomic numeric counters and does not lose comment writes.
- Failed login/profile recovery does not invent a local logged-in user; route guards verify the server.
- Registration validates supplied profile fields and age before creating the account.
- Same-origin `/api` requests and Socket.IO proxy/static hosting remove cross-site-cookie dependency.
- Old JSONPlaceholder test assumptions were replaced with tests of the actual backend contract. No old coverage percentage is reused.

## Reproduce

```sh
npm run setup
npm run verify
npm run benchmark
```

Chrome/Chromium is needed for the Angular unit suite; set `CHROME_BIN` if not discovered. MongoDB test binaries download from the official distribution on first run. Container smoke reproduction is documented in `DEPLOYMENT.md`. No cloud credentials are required for these local checks.

Remaining dependency note: backend and frontend production dependency audits show zero known advisories at the time of verification; the inherited Karma development toolchain reports six high advisories. No public development-server deployment is recommended or claimed. These package advisories are distinct from successful runtime regression results.

## UI consistency update

Login, registration, feed and profile adopt the existing chat palette, typography, navigation and controls. Own chat identity uses the profile display name; authorization still uses the original username. Production build and all 25 Angular tests pass. Existing bundle/style warning budgets remain.
