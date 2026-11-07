# Shift lifecycle — first implementation

- Lock key: `activeShifts/{carId}/{shiftType}`.
- Valid shift types: `day` and `night`.
- A Realtime Database transaction reserves the exact car/shift slot.
- The same car may have its day and night shifts active simultaneously.
- A failed history write attempts a guarded rollback that only releases its own lock.
- This is a concurrency mechanism, not authorization. Do not treat client-provided driver IDs as proof of identity.
- Ending/finalizing a shift, calculating elapsed hours, and writing payroll transactions are not implemented in this first increment and must be added with idempotency before operational use.
