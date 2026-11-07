# MT TAXI 2.0 — Realtime Database model

Project: `mt-taxi-20`  
Database region: `europe-west1`  
This schema is for the new project only. Never point legacy apps at this database.

## Root paths

- `fleetState/drivers/{driverId}`: stable immutable driver ID, display name, contact fields, active flag.
- `fleetState/cars/{carId}`: stable immutable car ID, plate, model, active flag, dayDriverId, nightDriverId.
- `fleetState/driverAssignmentIndex/{driverId}`: unique assigned slot key (`{carId}__day` or `{carId}__night`).
- `shiftState/activeByCar/{carShiftKey}`: active shift ID, keyed by car ID plus day/night.
- `shiftState/activeByDriver/{driverId}`: the driver's one active shift ID.
- `shiftState/history/{shiftId}`: shift record. Active reservations and history are changed in one transaction at `shiftState`.
- `weeklyRecords/{weekId}/{driverId}`: derived weekly totals and display summaries.
- `financialTransactions/{transactionId}`: append-only ledger entries with type, amount, driverId, effectiveAt, weekId, note, createdAt, idempotencyKey.
- `processedOperations/{operationId}`: idempotency markers for financial/admin operations.
- `advanceRequests/{requestId}`: requested amount, driverId, status, review metadata and timestamps.
- `messages/{messageId}`: sender/recipient IDs, body, createdAt, readAt.
- `attendance/{dateKey}/{driverId}`: attendance status and notes.

## Fleet invariants

1. IDs are generated once and remain stable; names and plates are display/search fields, never database keys.
2. A driver can occupy at most one active day/night car slot. `driverAssignmentIndex` enforces this within the `fleetState` transaction.
3. A car may have separate day and night drivers; the same driver cannot fill both slots.
4. Driver and car records are soft-disabled with `active:false`; hard deletion is not exposed, preserving historical references.
5. A driver with an active shift cannot be deactivated. A car with an active day/night shift cannot be deactivated.
6. Assignment operations verify that the car and selected drivers exist and are active.
7. Fleet records and the assignment index are updated in one transaction at `fleetState`. This makes consistency simple, but the transaction reads/writes the entire fleet subtree and can become expensive as the fleet grows.

## Shift invariants

1. A car can have one day and one night shift concurrently.
2. A driver can have only one active shift across all cars.
3. A single transaction at `shiftState` reserves both car/shift and driver, and creates the history record atomically.
4. Ending a shift updates its history and releases only reservations that still point to that exact shift ID, in the same transaction.
5. Repeating endShift for an already-ended shift returns the finalized record without adding hours again.
6. The fleet and shift transactions are separate database roots. Current client checks for active shifts before deactivation are preflight checks, not cross-root atomic guarantees; a trusted backend is required to eliminate that race and enforce authorization.
7. Keep transactions at `shiftState` limited in size; if history grows large, migrate to a trusted backend or a partitioned transactional design before scale-up.

## Financial invariants

Financial entries must be append-only, uniquely keyed, and idempotent. Weekly totals are derived from the ledger and reconciled. Financial operations are not implemented yet. Drivers are never hard-deleted by this service, but the client cannot reliably prove absence of financial history; the trusted backend must enforce any policy requiring that check.

## Media

Never store odometer photos as Base64 in Realtime Database. Storage upload design must be verified against enabled services and plan.

## Security boundary

The existing name-selection/localStorage login is retained for compatibility, but it does not prove identity to Firebase. Client-provided IDs and roles are not authorization. Keep rules locked until a trustworthy authorization design is selected. Do not import production data until a reviewed migration plan and backup exist.
