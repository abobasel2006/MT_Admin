# MT TAXI 2.0 — Realtime Database model

Project: `mt-taxi-20`  
Database region: `europe-west1`  
This schema is for the new project only. Never point legacy apps at this database.

## Root paths

- `settings/general`: currency, timezone, week-start convention, company options.
- `settings/payroll`: default hourly rate and payroll policy.
- `drivers/{driverId}`: stable immutable ID, display name, contact fields, active flag.
- `cars/{carId}`: stable ID, plate, model, active flag, dayDriverId, nightDriverId.
- `shiftState/activeByCar/{carShiftKey}`: active shift ID, keyed by car ID plus day/night.
- `shiftState/activeByDriver/{driverId}`: the driver's one active shift ID.
- `shiftState/history/{shiftId}`: shift record. Active reservations and history are changed in one transaction at `shiftState`.
- `weeklyRecords/{weekId}/{driverId}`: derived weekly totals and display summaries.
- `financialTransactions/{transactionId}`: append-only ledger entries with type, amount, driverId, effectiveAt, weekId, note, createdAt, idempotencyKey.
- `processedOperations/{operationId}`: idempotency markers for financial/admin operations.
- `advanceRequests/{requestId}`: requested amount, driverId, status, review metadata and timestamps.
- `messages/{messageId}`: sender/recipient IDs, body, createdAt, readAt.
- `attendance/{dateKey}/{driverId}`: attendance status and notes.

## Shift invariants

1. Stable driverId and carId values are required; display names are never keys.
2. A car can have one day and one night shift concurrently.
3. A driver can have only one active shift across all cars.
4. A single transaction at `shiftState` reserves both car/shift and driver, and creates the history record atomically.
5. Ending a shift updates its history and releases only reservations that still point to that exact shift ID, in the same transaction.
6. Repeating endShift for an already-ended shift returns the finalized record without adding hours again.
7. Keep transactions at shiftState limited in size; if history grows large, migrate to a trusted backend or a partitioned transactional design before scale-up.

## Financial invariants

Financial entries must be append-only, uniquely keyed, and idempotent. Weekly totals are derived from the ledger and reconciled. Financial operations are not implemented yet.

## Media

Never store odometer photos as Base64 in Realtime Database. Storage upload design must be verified against enabled services and plan.

## Security boundary

The existing name-selection/localStorage login is retained for compatibility, but it does not prove identity to Firebase. Client-provided IDs and roles are not authorization. Keep rules locked until a trustworthy authorization design is selected. Do not import production data until a reviewed migration plan and backup exist.
