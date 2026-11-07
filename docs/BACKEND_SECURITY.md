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
