# Deployment runbook

Status: Docker image built locally, production-container smoke test passed, MongoDB Atlas connected and verified; live cloud deployment pending hosting setup.

## Architecture

One persistent Node process serves the compiled Angular app, `/api` routes, and `/socket.io` behind one HTTPS origin. This avoids cross-site session cookies. MongoDB is external and persistent. Production uses Secure, HttpOnly, SameSite=Lax session cookies. Set an exact `FRONTEND_ORIGIN` and use HTTPS for hosted deployments.

The reference deployment uses a persistent web service supporting WebSockets (e.g. Render); static hosting or a request-scoped function alone does not host this Socket.IO server. Render documents [web services](https://render.com/docs/web-services), [Docker deployment](https://render.com/docs/docker), and [WebSocket support](https://render.com/docs/websocket).

## Before connecting the user's MongoDB

Choose a new database name such as `ricebook_live` rather than running tests or seed scripts against HW7's existing database. Use a database user limited to that database and a network rule suitable for the chosen host. Supply the connection string privately through the host's environment settings or local `.env`; never add it to source.

## Container deployment

From the repository root:
```sh
docker build -t ricebook-live .
```
`Dockerfile` builds Angular in a separate build stage, installs only production backend dependencies, runs as a non-root user and provides `/ready` health checks. No `.env`, demo database or seed accounts are baked into the runtime image.

A local stack can be started with:
```sh
APP_PORT=4300 FRONTEND_ORIGIN=http://localhost:4300 docker compose -f compose.production.yaml up --build -d
```
It uses a named MongoDB volume and binds the app only to loopback. Hosted production requires TLS at the platform/reverse proxy; the local container test sends cookies explicitly to test the backend without claiming public TLS validation.

## Render handoff

1. Put this source in a repository you own; keep it private until you choose otherwise.
2. Create a Docker Web Service from that repository. Review the selected plan/cost before provisioning.
3. Configure `MONGO_URL` (new database), `FRONTEND_ORIGIN` (the exact final HTTPS origin), `NODE_ENV=production`, `WEB_ROOT=/app/web`, and `TRUST_PROXY=1` when behind the single trusted platform proxy.
4. Set health path `/ready`. Let the platform provide `PORT`.
5. Deploy, wait for healthy status, and verify the checklist below against the returned URL.
6. Add Google credentials only when your OAuth app and final callback URI are configured. `render.yaml` supplies the core service template; no deployment has been created by this file alone.

## Live acceptance checks (pending)

- HTTPS root and `/main`, `/profile`, `/chat` deep links load the SPA.
- Register and login through browser; confirm cookie session persists across refresh.
- In a second browser profile, join the same public room and exchange messages.
- Private-room outsider is denied; invited member can join; removed member loses access.
- Publish and comment on a post; confirm records survive refresh.
- Restart/redeploy the app and confirm history and sessions survive.
- Real Google consent flow, callback, refresh and logout.
- Test load only on a target/environment you own, with a workload appropriate to the selected plan. Local measurements do not replace hosted measurements.

## Local production smoke evidence

`docs/container-smoke-results.json` records the verified local checks. Reproduce after starting the named QA stack:
```sh
APP_PORT=4300 FRONTEND_ORIGIN=http://localhost:4300 docker compose -p ricebook-live-qa -f compose.production.yaml up --build -d
cd backend
node scripts/container-smoke.js
```
The script only targets `localhost:4300` and restarts `ricebook-live-qa-app-1`. It creates isolated QA accounts; never point it at the real deployment.

Stop the QA stack (keeps its database volume):
```sh
docker compose -p ricebook-live-qa -f compose.production.yaml down
```
