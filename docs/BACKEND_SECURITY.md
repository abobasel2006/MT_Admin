# MT TAXI 2.0 — Backend security boundary

## Status
This is a development-only Cloud Functions scaffold on the `mt-taxi-2.0` branch. It has not been deployed and does not change Firebase data or Realtime Database Rules.

## Authentication is mandatory
Callable functions reject requests without Firebase Authentication. Driver operations additionally require trusted token claims:
- `role: "driver"`
- `driverId: "<stable fleet driver ID>"`

The claim must be assigned by a trusted administrative process after verifying the person's identity. A browser-provided driverId, localStorage value, selected driver name, or request field is never accepted as proof of identity. Admin operations must require `role: "admin"` and will be added only after a trusted admin identity/provisioning flow is approved.

## Compatibility with the current login
The current name-selection/localStorage login remains unchanged in the V2 client. It does not create Firebase Auth credentials, so the existing clients cannot call these protected functions successfully yet. This is intentional fail-closed behavior. Do not weaken the functions to accept client-supplied IDs.

A later decision is required: retain the visible login screen but add a secure identity mechanism behind it, or accept that privileged server operations cannot be authorized per driver. No authentication change is made by this commit.

## Transaction model
The initial shift functions use a Realtime Database root transaction so fleet assignment validation, shift reservation, history creation, and reservation release are serialized together. This closes the cross-root race present in the client services, but root transactions can become expensive and create contention as the database grows. Before production scale, move critical state into a deliberately designed transactional aggregate or another trusted datastore model, with migration and load tests.

## Deployment checklist
1. Review and test functions in an isolated Firebase project.
2. Decide and implement trusted claim provisioning and account recovery.
3. Add emulator tests for simultaneous starts, duplicate ends, wrong-driver ends, inactive/unassigned drivers, and odometer validation.
4. Review database rules separately; Admin SDK bypasses client rules.
5. Deploy only after explicit approval. No deployment is performed by this change.

## Four-digit driver PIN (development implementation)
- Driver PINs are exactly four ASCII digits (`0000` through `9999`); leading zeroes are preserved.
- `setDriverPin` requires an authenticated caller with the trusted `role: "admin"` claim and an active driver record.
- PINs are salted and derived with scrypt plus a Secret Manager pepper (`MT_TAXI_PIN_PEPPER`). The raw PIN is not stored.
- `loginWithPin` checks the PIN and issues a Firebase custom token carrying the server-controlled driver role and driver ID.
- Five consecutive failures for a driver trigger a 15-minute lockout. This per-driver throttle is not a substitute for App Check and broader abuse monitoring.
- Before deployment, create the `MT_TAXI_PIN_PEPPER` secret in the Firebase/GCP project. Do not commit it or send it in chat.
- The admin claim is now issued by the temporary admin PIN callable after server-side verification. The V2 admin page and driver PIN client have been wired to their callables, but they have not been deployed or tested end-to-end. Do not treat the flow as production-ready until App Check site-key configuration, Secret Manager setup, and emulator/staging tests are complete.


## Temporary management-page access model
The management page itself loads without a sign-in screen. Its private fleet and shift data are not loaded until the operator selects **فتح بيانات الإدارة**. The operator then confirms the temporary four-digit admin PIN; the backend verifies it and issues a short-lived Firebase custom-token session with the server-controlled `role: "admin"` claim. The session uses browser-session persistence. Protected management actions also pass through this gate.

The temporary admin PIN is read only from Firebase Secret Manager under `MT_TAXI_ADMIN_PIN`; it must never be added to the web app, source control, or browser storage. The owner must set that secret out-of-band. The current source does not contain the PIN value.

**Security limitation:** a four-digit PIN has only 10,000 possibilities. The current callable includes an IP-based 5-attempt/15-minute throttle, but this is not sufficient by itself for production. Firebase App Check enforcement, broader abuse monitoring, and a stronger operator factor or planned rotation are mandatory before deployment. The code is development-only until those protections are configured and tested.


## App Check
Every callable function is configured with `enforceAppCheck: true`. Both V2 clients contain App Check initialization, but the reCAPTCHA v3 site-key placeholder is intentionally empty. Until the owner registers the app and configures the key, callable requests fail closed. Do not disable enforcement to make the app appear functional.
