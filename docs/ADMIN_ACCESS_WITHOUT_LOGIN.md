# MT TAXI 2.0 — Keep the admin page open without an in-app login

## Owner requirement
The management page must continue to open directly without a conventional login screen. The link is intended to be shared only with crew members. This is a user-experience requirement, not a security boundary: a public GitHub Pages URL can be opened by anyone who obtains it, and browser code and network requests can be inspected.

## What must not be done
- Do not remove the trusted `role=admin` check from `setDriverPin`.
- Do not place an admin password, shared secret, pepper, private key, or reusable bearer token in HTML, JavaScript, GitHub, or localStorage.
- Do not treat an obscure URL, a hidden button, a selected admin name, a device identifier, or Firebase App Check alone as proof that a person is an administrator.
- Do not enable public Realtime Database writes or weaken rules to make the current direct-client CRUD work.
- Do not add an in-app login screen against the owner's stated requirement.

## Feasible access models

### A. Public page, protected admin actions (recommended if the page itself must remain directly accessible)
The page loads without a login form. Before a sensitive action (PIN issuance, driver/car mutation, administrative shift closure), the operator completes a platform-mediated authorization step such as a passkey/WebAuthn assertion. A trusted backend verifies the assertion and issues a short-lived Firebase custom-token session with `role=admin`. The page remains visually open; only protected actions require authorization. Enrollment and recovery must be performed out of band by the owner. The backend must enforce authorization on every mutation.

This is not a conventional login page, but it is still strong operator authentication. Without some proof of operator authority, a backend cannot distinguish a crew member from an outsider who has the same public URL.

### B. Restrict the entire URL to the crew
Put the site behind an access gateway such as Cloudflare Access or an equivalent identity-aware proxy. This prevents non-crew visitors from loading the page, but normally requires an identity check (for example, a crew email one-time code) and compatible domain/gateway configuration. GitHub Pages alone does not provide per-crew access control for a public site.

### C. Truly no authentication at all
This cannot securely satisfy the requirement that only crew members may use administrative capabilities. Anyone who obtains the public link can impersonate an administrator if the backend accepts unauthenticated administrative requests. This mode must not be used for PIN issuance, fleet changes, financial records, or shift control.

## Required implementation sequence
1. Keep the management page and its current no-login landing experience.
2. Select and configure a trusted operator proof (prefer passkey/WebAuthn action approval or an identity-aware access gateway); provision the owner/admin out of band.
3. Add server-side verification and short-lived admin custom-token issuance. Never trust role claims supplied by the browser.
4. Wire the PIN UI to `setDriverPin` only after the backend admin session is established.
5. Move fleet CRUD and administrative shift actions behind authenticated callable functions; remove direct client write access.
6. Migrate driver sign-in to the four-digit PIN callable and `signInWithCustomToken`; preserve leading zeroes.
7. Apply least-privilege RTDB rules, App Check, global abuse controls, and Emulator Suite tests.
8. Test in an isolated staging project, then request explicit approval before any production deployment.

## Current verified status
- The V2 `setDriverPin` function already rejects callers without a trusted admin claim and hashes four-digit PINs with scrypt, per-driver salt, and a Secret Manager pepper.
- The current admin page is still a direct-client Firebase page; it has no trusted admin session, no PIN issuance UI, and no protected backend CRUD integration.
- The current driver page is not yet wired to PIN login and Firebase custom-token sign-in.
- The Cloud Functions scaffold has not been deployed. The project is on the Firebase Spark plan; deploying Cloud Functions requires resolving the billing/plan requirement. Do not upgrade billing without the owner's explicit approval.
- Production `main`, production GitHub Pages URLs, and existing Firebase data/rules must remain untouched until staging verification and explicit release approval.

**Release status: blocked.** Keeping the page visually open is compatible with secure authorization, but secure administrative actions cannot be made crew-only with a public link and zero authentication or other trusted proof.
