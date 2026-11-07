# MT TAXI 2.0 — Release readiness

**Current state: NOT APPROVED FOR PRODUCTION DEPLOYMENT.**

This branch is isolated from the production `main` branch. Do not merge it or publish it to the production GitHub Pages URL until every blocking item below is completed and verified.

## Confirmed preparation

- V2 source is kept on the `mt-taxi-2.0` branch.
- A GitHub Actions static-validation workflow checks JavaScript syntax and JSON configuration.
- Existing production files and Firebase data are not changed by this branch.

## Production blockers

1. **Driver PIN UI and authentication:** the driver page still uses name/assignment selection and localStorage. Replace it with the exact four-digit PIN flow, call `loginWithPin`, sign in using Firebase `signInWithCustomToken`, and derive the driver identity only from trusted token claims.
2. **Admin identity and PIN provisioning:** `setDriverPin` requires a trusted `role=admin` claim. Establish and document a secure, one-time admin provisioning/recovery process. Do not expose an unauthenticated public PIN-setting endpoint and do not trust a role or driver ID supplied by browser code.
3. **Admin Firebase Auth integration:** sign in the admin session with a server-issued custom token and require that identity for PIN issuance. Keep the management page visually open if desired; an open page is not authorization.
4. **Database rules:** replace the current deny-all development rules with reviewed least-privilege rules that require Firebase Auth claims. Validate them with the Firebase Emulator Suite before deployment. Never open the database to public read/write.
5. **Functions protection:** add Firebase App Check and abuse controls for PIN attempts, including limits beyond a per-driver counter. Keep the pepper in Secret Manager; never commit it.
6. **Client operations:** route shift start/end and privileged fleet mutations through trusted backend functions. Client-side IDs and localStorage are not identity.
7. **Automated tests:** add emulator tests for PIN success/failure/lockout, inactive drivers, unauthorized admin calls, concurrent day/night shift starts, duplicate starts, wrong-driver end attempts, duplicate ends, and odometer validation.
8. **Deployment configuration:** confirm the Firebase plan and required billing explicitly, configure secrets and App Check, deploy to an isolated staging project, and verify end-to-end before any production cutover.
9. **Release validation:** test both apps on mobile and desktop, confirm data integrity and rollback steps, then obtain explicit approval before merging to `main` or changing production GitHub Pages.

## Explicit non-goals

- Do not migrate, overwrite, or delete legacy production data as part of static validation.
- Do not modify `main`, production Firebase rules, production Functions, or production Pages from this branch.
- Do not enable paid billing without the owner's explicit approval.

A passing static-validation workflow is not an authentication, security, emulator, integration, or production-readiness test.
