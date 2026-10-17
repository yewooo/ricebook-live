# Connect your own Google login

Status: real Google account sign-in has now been verified with the local application connected to MongoDB Atlas: Google consent → application callback → authenticated feed → refresh retains the session → chat route connects. Room creation, message persistence and history recovery after refresh also pass against Atlas. The hosted callback remains unconfigured until a deployment URL is chosen. A new dedicated client was created in the existing comp531-oauth project; its consent screen retains the project branding “COMP531 OAuth Login”. Credentials are stored only in ignored backend/.env, with owner-only file permissions.

## Local configuration first

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create or select a project you own.
2. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview). Configure Branding (app name: RiceBook Live; your support email), Audience (External for personal Gmail; Testing while setting up), and your contact email. Add your own Google email as a test user if the testing settings require it.
3. Under Clients, create an OAuth client of type **Web application**.
4. Add this exact authorized redirect URI for the local app:
   ```text
   http://localhost:4200/api/auth/google/callback
   ```
   The frontend dev proxy forwards this to the backend. The URI must match the app configuration exactly. Use `localhost`, not `127.0.0.1`.
5. Put the client ID and client secret into `backend/.env`, never into chat, the repository, or frontend source:
   ```dotenv
   FRONTEND_ORIGIN=http://localhost:4200
   GOOGLE_CLIENT_ID=<your client ID>
   GOOGLE_CLIENT_SECRET=<your client secret>
   GOOGLE_CALLBACK_URL=http://localhost:4200/api/auth/google/callback
   ```
6. Restart the backend. **Continue with Google** appears only when the backend reports a configured provider.
7. Click it, choose your Google account, and complete Google's consent screen yourself. Verify arrival at the feed, open Chat rooms, refresh, then logout. Record the result before claiming a real Google sign-in was tested.

The application requests only profile and email, stores the Google subject ID and basic profile, and does not request access to Gmail, Drive or Calendar. A Google email does not silently merge with a matching local account.

## Hosted configuration

Once the final app origin is known, add:
```text
https://YOUR-APP-HOST/api/auth/google/callback
```
as a second authorized redirect URI. Set `FRONTEND_ORIGIN=https://YOUR-APP-HOST` and `GOOGLE_CALLBACK_URL=https://YOUR-APP-HOST/api/auth/google/callback` on the host. Do not use a localhost callback for the hosted app. Restart/redeploy and repeat the actual account flow.

## Verified automatically

- Authorization redirect with profile/email scope and expiring HttpOnly state cookie.
- Rejection of absent, mismatched, expired and replayed state.
- Mock authorization-code exchange and userinfo retrieval through the real Passport strategy.
- Real application session creation after successful mock callback.
- Identity reuse across repeated sign-ins and recoverable cancellation.

Source: [Google web-server OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Passport Google OAuth strategy](https://www.passportjs.org/packages/passport-google-oauth20/).
