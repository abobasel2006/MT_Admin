# Shift lifecycle — transactional implementation

- State root: `shiftState`.
- `activeByCar/{carId}__{shiftType}` permits one day and one night shift per car.
- `activeByDriver/{driverId}` prevents one driver from starting shifts on multiple cars.
- `history/{shiftId}` stores the record using `startedAt` and `endedAt` consistently.
- Start reserves the car slot, driver slot, and creates history in one RTDB transaction.
- End finalizes the exact shift and releases only matching reservations in one RTDB transaction.
- Repeated end requests are idempotent.
- This is a client-side concurrency guard, not authorization.
- Finance/payroll integration and automated concurrency tests remain pending.
