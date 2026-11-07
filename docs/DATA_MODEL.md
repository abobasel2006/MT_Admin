# MT TAXI 2.0 — Realtime Database model

Project: `mt-taxi-20`  
Database region: `europe-west1`  
This schema is for the new project only. Never point the legacy MT TAXI apps at this database.

## Root paths

- `settings/general`: currency, timezone, week-start convention, company options.
- `settings/payroll`: default hourly rate and payroll policy.
- `drivers/{driverId}`: stable ID, display name, contact fields, active flag, assigned car/shift metadata.
- `cars/{carId}`: plate, model, active flag, `dayDriverId`, `nightDriverId`.
- `shifts/{shiftId}`: immutable identity plus driverId, carId, shiftType, startAt, endAt, startOdometer, endOdometer, status, finalization metadata.
- `activeShifts/{carId}/{shiftType}`: transactional reservation for exactly one active shift per car and shift type. Day and night shifts on the same car may run concurrently.
- `weeklyRecords/{weekId}/{driverId}`: derived weekly totals and display summaries; transaction ledger remains the financial source of truth.
- `financialTransactions/{transactionId}`: append-only ledger entries with type, amount, driverId, effectiveAt, weekId, note, createdAt, createdByLabel, idempotencyKey.
- `processedOperations/{operationId}`: idempotency markers for retried financial/admin operations.
- `advanceRequests/{requestId}`: requested amount, driverId, status, review metadata and timestamps.
- `messages/{messageId}`: sender/recipient IDs, body, createdAt, readAt.
- `attendance/{dateKey}/{driverId}`: attendance status and notes.

## Invariants

1. Every driver has a stable `driverId`; names are labels, never primary keys.
2. A car can have one active day shift and one active night shift at the same time.
3. Acquiring/releasing a shift lock uses Realtime Database transactions. A shift is not started unless its matching lock is acquired.
4. Ending a shift is idempotent and finalizes the exact shift ID; retries cannot add its hours twice.
5. Financial entries are append-only and carry a unique idempotency key. Weekly totals are derived from the ledger and reconciled.
6. Never store odometer photos as Base64 in Realtime Database. Storage upload design is a separate step and must be verified against the project's enabled services and plan.
7. Do not import or copy production data until a reviewed migration plan and backup exist.

## Security boundary

The existing name-selection/localStorage login is retained for compatibility, but it does not prove identity to Firebase. Do not grant public read/write access on the basis of that client-side session. Keep database rules locked while implementing. Before production use, choose a trustworthy authorization mechanism or explicitly accept and document the residual risk; client-supplied role/driver IDs are not authorization.
