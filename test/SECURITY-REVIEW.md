# MT Admin — Security boundary review (test branch)

Date: 2026-11-06
Branch: security/no-auth-boundary-review-2026-11

## Scope and safety
- Review only. No Firebase production data, rules, or production root page was changed.
- This branch contains documentation only; it does not change the running admin app.
- The test copy at `test/index.html` still contains placeholder Firebase configuration and stops before initialization while placeholders remain.
- Test-copy blob reviewed: `e49b3271a8658d24515e9805ac797a5a574eabe4`.

## Findings
1. **Critical — no trusted admin authentication gate was found.** The reviewed admin page initializes Firebase and starts database listeners without a verified administrator identity. No `adminLogin()` function was found in the reviewed test copy.
2. **Critical — broad database reads.** The page subscribes to the complete `cars`, `notes`, `weeklyRecords`, `pendingAdvances`, and `activeShifts` paths. Actual exposure is determined by the deployed Realtime Database rules.
3. **Critical — privileged writes originate in the browser.** The page writes the hourly rate, payment fields, attendance status, notes, car records, weekly settlement updates, and shift finalization directly to Realtime Database.
4. **High — UI visibility is not authorization.** Hiding controls or relying on an unlisted URL does not prevent direct requests to Firebase.
5. **Medium — retry/duplicate risk remains for some manual financial actions.** Existing transaction/idempotency protections cover important shift and advance flows, but not every manual payment or settlement write has a durable idempotency key.

## Confirmed code paths in the reviewed test copy
- Reads: `settings/hourlyRate`, `cars`, `notes`, `weeklyRecords`, `pendingAdvances`, `activeShifts`.
- Writes: `settings/hourlyRate`; payment fields under `weeklyRecords`; attendance status; notes; full `cars` writes; weekly record transaction; root multi-location settlement update.
- Inline JavaScript syntax check: passed (1 inline script block).

## What can be improved without changing the driver login
- Keep the existing visual workflow and harden DOM rendering, input validation, numeric/date bounds, and error handling.
- Add durable idempotency keys to manual payments and settlement operations so retries cannot duplicate financial effects.
- Add audit records for sensitive actions (who/what/when), while clearly marking the actor identity as unverified under the current login model.
- Keep shift finalization and advance approval transaction protections.
- App Check may reduce automated traffic from outside the app, but it does **not** prove that a caller is an administrator.
- A callable Cloud Function without a verified administrator identity is still callable by an unauthorized user. A shared secret embedded in browser code is not secret.

## Hard boundary
With no trusted administrator identity, Firebase cannot securely distinguish the administrator from a driver or anonymous visitor. It is not possible to enforce admin-only writes while retaining only a public, client-side interface and no identity proof. Strong administrative authorization requires a trusted identity proof or a separate protected administrative channel.

## Production rules warning
The owner-provided Firebase Console screenshot showed root-level `.read` and `.write` conditions based only on a time limit ending 2026-11-29. While active, these conditions permit unauthenticated reads and writes. After expiry, reads and writes may stop for everyone. This review intentionally did not publish or change rules.

## Next safe work
1. Keep production rules untouched until a separate test Firebase project is configured.
2. Test every read/write path against that isolated project or the Firebase Emulator.
3. Prepare candidate validation rules only for the test environment, documenting that they cannot grant admin-only permissions without authentication.
4. Add idempotency to manual financial operations in the test branch before any release consideration.
