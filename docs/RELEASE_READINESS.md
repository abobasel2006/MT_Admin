# MT TAXI 2.0 — Release readiness

**Current state: NOT APPROVED FOR PRODUCTION DEPLOYMENT.**

This branch is isolated from the production `main` branch. Do not merge it or publish it to the production GitHub Pages URL until every blocking item below is completed and verified.

## Confirmed preparation

- V2 source is kept on the `mt-taxi-2.0` branch.
- A GitHub Actions static-validation workflow checks JavaScript syntax and JSON configuration.
- Existing production files and Firebase data are not changed by this branch.

## Production blockers

1. **Driver PIN UI and authentication:** the V2 driver page now requests the assigned driver and a four-digit PIN, calls `loginWithPin`, signs in using Firebase `signInWithCustomToken`, and checks the trusted driver claims. Shift start/end and active-shift lookup now call the trusted backend. End-to-end verification and App Check remain outstanding.
2. **Admin identity and PIN provisioning:** the management page now has an on-demand unlock flow (the page itself still opens without a login screen). `loginAdminWithPin` reads its temporary four-digit PIN only from Secret Manager and issues a server-controlled `role=admin` token. Set `MT_TAXI_ADMIN_PIN` out-of-band; the PIN value must never enter GitHub. The current IP throttle is not production-grade by itself; App Check enforcement, abuse monitoring, and stronger operator authentication/rotation remain mandatory.
3. **Admin Firebase Auth integration:** the admin V2 page now opens without a login screen and prompts for the admin PIN only when the operator opens protected data/actions. It signs in with a server-issued custom token. Validate session expiry, shared-device behavior, and every mutation.
4. **Database rules:** V2 development rules now allow fleet read/write only to trusted admin claims, allow shift reads only to admins, and deny direct client shift writes and all other paths. Validate with the Firebase Emulator Suite before deployment. Never open the database to public read/write.
5. **Functions protection:** App Check enforcement is enabled on every callable function, but the public reCAPTCHA Enterprise site key is still blank in both V2 clients. Register the apps in Firebase App Check, configure the site key in both clients, and verify valid/invalid attestation before deployment. Keep `MT_TAXI_PIN_PEPPER` and `MT_TAXI_ADMIN_PIN` in Secret Manager; never commit either.
6. **Client operations:** shift start/end and all fleet create/update/assignment/deactivation operations now use trusted callable backend functions. Direct client writes to fleet and shift state are denied by the V2 rules. Verify every callable and race condition in the Emulator Suite.
7. **Automated tests:** add emulator tests for PIN success/failure/lockout, inactive drivers, unauthorized admin calls, concurrent day/night shift starts, duplicate starts, wrong-driver end attempts, duplicate ends, and odometer validation.
8. **Deployment configuration:** confirm the Firebase plan and required billing explicitly, configure secrets and App Check, deploy to an isolated staging project, and verify end-to-end before any production cutover.
9. **Release validation:** test both apps on mobile and desktop, confirm data integrity and rollback steps, then obtain explicit approval before merging to `main` or changing production GitHub Pages.

## Explicit non-goals

- Do not migrate, overwrite, or delete legacy production data as part of static validation.
- Do not modify `main`, production Firebase rules, production Functions, or production Pages from this branch.
- Do not enable paid billing without the owner's explicit approval.

A passing static-validation workflow is not an authentication, security, emulator, integration, or production-readiness test.


## Latest development work
- Driver PIN entry and Firebase custom-token authentication have been wired in the V2 driver client.
- Driver shift start/end and active-shift lookup use callable backend functions, not client-supplied driver IDs.
- Admin page opens directly; a deliberate protected-workspace action requests the temporary admin PIN and creates a browser-session admin token.
- Admin PIN assignment UI is present on active driver cards.
- RTDB development rules restrict fleet/shift data to the trusted admin claim; driver shift writes are server-side only.
- These changes are source preparation only. The backend has not been deployed, secrets have not been configured, and the rules have not been published or emulator-tested.


## Remaining external setup (not yet performed)
- Register the two V2 web apps with Firebase App Check (reCAPTCHA Enterprise), then place the resulting public site key in each V2 `src/firebase.js` `appCheckSiteKey` constant. The current empty value is intentional fail-closed preparation.
- Set `MT_TAXI_ADMIN_PIN` and `MT_TAXI_PIN_PEPPER` in Firebase Secret Manager without placing either value in GitHub or browser code.
- Enable the required Firebase Authentication custom-token flow and deploy the functions/rules only to an isolated staging project after resolving the plan requirement.
