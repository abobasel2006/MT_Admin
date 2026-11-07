import { db, ref, push, runTransaction, set } from "../firebase.js";

/**
 * Reserve one car/shift slot atomically.
 * The same car may have one day and one night shift concurrently.
 * This is a client-side concurrency guard, not an authorization boundary.
 */
export async function startShift({ driverId, carId, shiftType, startOdometer = null }) {
  if (!driverId || !carId || !["day", "night"].includes(shiftType)) {
    throw new Error("بيانات الوردية غير مكتملة.");
  }

  const shiftId = push(ref(db, "shifts")).key;
  if (!shiftId) throw new Error("تعذر إنشاء معرف الوردية.");

  const startedAt = Date.now();
  const lockRef = ref(db, `activeShifts/${carId}/${shiftType}`);
  const shift = {
    shiftId,
    driverId,
    carId,
    shiftType,
    status: "active",
    startedAt,
    startOdometer,
    endedAt: null,
    endOdometer: null
  };

  const reservation = await runTransaction(lockRef, current => {
    if (current && current.status === "active") return;
    return shift;
  });

  if (!reservation.committed) {
    throw new Error("هذه الوردية مشغولة بالفعل لهذه السيارة.");
  }

  try {
    await set(ref(db, `shifts/${shiftId}`), shift);
    return { ...shift };
  } catch (error) {
    // Compensate only if this operation still owns the reservation.
    await runTransaction(lockRef, current => {
      if (current?.shiftId === shiftId) return null;
      return current;
    });
    throw error;
  }
}
