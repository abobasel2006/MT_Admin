import { db, ref, push, runTransaction } from "../firebase.js";

const validShiftTypes = new Set(["day", "night"]);
const stateRef = ref(db, "shiftState");

/**
 * Atomically reserves a car/shift slot AND a driver, and creates history.
 * A single transaction is used so the lock and history cannot diverge if the
 * client closes between separate writes. This is a concurrency guard only,
 * not an authorization boundary.
 */
export async function startShift({ driverId, carId, shiftType, startOdometer = null }) {
  if (typeof driverId !== "string" || !driverId.trim() ||
      typeof carId !== "string" || !carId.trim() ||
      !validShiftTypes.has(shiftType)) {
    throw new Error("بيانات الوردية غير مكتملة.");
  }
  if (startOdometer !== null &&
      (!Number.isFinite(Number(startOdometer)) || Number(startOdometer) < 0)) {
    throw new Error("قراءة عداد البداية غير صحيحة.");
  }

  const shiftId = push(ref(db, "shifts")).key;
  if (!shiftId) throw new Error("تعذر إنشاء معرف الوردية.");

  const startedAt = Date.now();
  const shift = {
    shiftId, driverId: driverId.trim(), carId: carId.trim(), shiftType,
    status: "active", startedAt, endedAt: null,
    startOdometer: startOdometer === null ? null : Number(startOdometer),
    endOdometer: null, durationMinutes: null
  };
  const carKey = `${shift.carId}__${shift.shiftType}`;

  const result = await runTransaction(stateRef, current => {
    const state = current || { activeByCar: {}, activeByDriver: {}, history: {} };
    state.activeByCar ||= {};
    state.activeByDriver ||= {};
    state.history ||= {};
    if (state.activeByCar[carKey] || state.activeByDriver[shift.driverId]) return;
    state.activeByCar[carKey] = shiftId;
    state.activeByDriver[shift.driverId] = shiftId;
    state.history[shiftId] = shift;
    return state;
  });

  if (!result.committed) {
    throw new Error("السائق لديه وردية نشطة أو أن هذه الوردية محجوزة لهذه السيارة.");
  }
  return shift;
}

/**
 * Idempotently finalizes exactly one shift and releases its two reservations.
 * Repeating the same request returns the already-finalized record.
 */
export async function endShift({ shiftId, driverId, endOdometer = null }) {
  if (typeof shiftId !== "string" || !shiftId.trim() ||
      typeof driverId !== "string" || !driverId.trim()) {
    throw new Error("بيانات إنهاء الوردية غير مكتملة.");
  }
  if (endOdometer !== null &&
      (!Number.isFinite(Number(endOdometer)) || Number(endOdometer) < 0)) {
    throw new Error("قراءة عداد النهاية غير صحيحة.");
  }

  let finalized = null;
  const result = await runTransaction(stateRef, current => {
    if (!current?.history?.[shiftId]) return;
    const state = current;
    const shift = state.history[shiftId];
    if (shift.driverId !== driverId.trim()) return;
    if (shift.status === "ended") {
      finalized = shift;
      return state;
    }
    if (shift.status !== "active") return;

    const endedAt = Date.now();
    const start = Number(shift.startedAt);
    if (!Number.isFinite(start) || endedAt < start) return;
    if (endOdometer !== null && shift.startOdometer !== null &&
        Number(endOdometer) < Number(shift.startOdometer)) return;

    const updated = {
      ...shift,
      status: "ended",
      endedAt,
      endOdometer: endOdometer === null ? null : Number(endOdometer),
      durationMinutes: Math.floor((endedAt - start) / 60000)
    };
    state.history[shiftId] = updated;
    const carKey = `${shift.carId}__${shift.shiftType}`;
    if (state.activeByCar?.[carKey] === shiftId) delete state.activeByCar[carKey];
    if (state.activeByDriver?.[shift.driverId] === shiftId) delete state.activeByDriver[shift.driverId];
    finalized = updated;
    return state;
  });

  if (!result.committed || !finalized) {
    throw new Error("تعذر إنهاء الوردية: تحقق من معرف الوردية والسائق وحالة العداد.");
  }
  return finalized;
}
