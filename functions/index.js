const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp();
const database = getDatabase();

function requireIdentity(request, role) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "يلزم تسجيل هوية موثوقة للوصول إلى الخدمة.");
  }
  const claims = request.auth.token || {};
  if (role === "driver" && (claims.role !== "driver" || !claims.driverId)) {
    throw new HttpsError("permission-denied", "حساب السائق غير معتمد لهذه العملية.");
  }
  if (role === "admin" && claims.role !== "admin") {
    throw new HttpsError("permission-denied", "هذه العملية مخصصة للإدارة.");
  }
  return claims;
}

function validOdometer(value) {
  return value === null || value === undefined ||
    (Number.isFinite(Number(value)) && Number(value) >= 0);
}

exports.startShift = onCall({ region: "europe-west1" }, async (request) => {
  const claims = requireIdentity(request, "driver");
  const driverId = String(claims.driverId);
  const { carId, shiftType, startOdometer = null } = request.data || {};

  if (typeof carId !== "string" || !carId.trim() ||
      !["day", "night"].includes(shiftType) || !validOdometer(startOdometer)) {
    throw new HttpsError("invalid-argument", "بيانات بدء الوردية غير صحيحة.");
  }

  const root = database.ref();
  const historyRef = database.ref("shiftState/history");
  const shiftId = historyRef.push().key;
  const startedAt = Date.now();
  const carKey = carId.trim() + "__" + shiftType;
  let failure = "aborted";

  const result = await root.transaction((current) => {
    const state = current || {};
    const fleet = state.fleetState || {};
    const driver = fleet.drivers && fleet.drivers[driverId];
    const car = fleet.cars && fleet.cars[carId.trim()];
    const assignedField = shiftType === "day" ? "dayDriverId" : "nightDriverId";

    if (!driver || driver.active !== true || !car || car.active !== true ||
        car[assignedField] !== driverId) {
      failure = "assignment";
      return;
    }

    const shifts = state.shiftState || {};
    const activeByCar = shifts.activeByCar || {};
    const activeByDriver = shifts.activeByDriver || {};
    if (activeByCar[carKey] || activeByDriver[driverId]) {
      failure = "conflict";
      return;
    }

    state.shiftState ||= {};
    state.shiftState.activeByCar ||= {};
    state.shiftState.activeByDriver ||= {};
    state.shiftState.history ||= {};
    state.shiftState.activeByCar[carKey] = shiftId;
    state.shiftState.activeByDriver[driverId] = shiftId;
    state.shiftState.history[shiftId] = {
      shiftId, driverId, carId: carId.trim(), shiftType,
      status: "active", startedAt, endedAt: null,
      startOdometer: startOdometer == null ? null : Number(startOdometer),
      endOdometer: null, durationMinutes: null
    };
    return state;
  }, undefined, false);

  if (!result.committed) {
    const message = failure === "assignment"
      ? "السائق أو السيارة غير نشطين أو أن التعيين لا يطابق الوردية."
      : "لدى السائق وردية نشطة أو أن خانة السيارة محجوزة.";
    throw new HttpsError("failed-precondition", message);
  }
  return result.snapshot.val().shiftState.history[shiftId];
});

exports.endShift = onCall({ region: "europe-west1" }, async (request) => {
  const claims = requireIdentity(request, "driver");
  const driverId = String(claims.driverId);
  const { shiftId, endOdometer = null } = request.data || {};

  if (typeof shiftId !== "string" || !shiftId.trim() || !validOdometer(endOdometer)) {
    throw new HttpsError("invalid-argument", "بيانات إنهاء الوردية غير صحيحة.");
  }

  let failure = "aborted";
  const result = await database.ref().transaction((current) => {
    const shift = current?.shiftState?.history?.[shiftId.trim()];
    if (!shift || shift.driverId !== driverId) {
      failure = "not-owner";
      return;
    }
    if (shift.status === "ended") return current;
    if (shift.status !== "active") {
      failure = "state";
      return;
    }
    if (endOdometer != null && shift.startOdometer != null &&
        Number(endOdometer) < Number(shift.startOdometer)) {
      failure = "odometer";
      return;
    }

    const endedAt = Date.now();
    const state = current;
    const stored = state.shiftState.history[shiftId.trim()];
    stored.status = "ended";
    stored.endedAt = endedAt;
    stored.endOdometer = endOdometer == null ? null : Number(endOdometer);
    stored.durationMinutes = Math.floor((endedAt - Number(stored.startedAt)) / 60000);

    const carKey = stored.carId + "__" + stored.shiftType;
    if (state.shiftState.activeByCar?.[carKey] === shiftId.trim()) {
      delete state.shiftState.activeByCar[carKey];
    }
    if (state.shiftState.activeByDriver?.[driverId] === shiftId.trim()) {
      delete state.shiftState.activeByDriver[driverId];
    }
    return state;
  }, undefined, false);

  if (!result.committed) {
    const messages = {
      "not-owner": "الوردية غير موجودة أو لا تخص حساب السائق.",
      state: "حالة الوردية لا تسمح بإنهائها.",
      odometer: "عداد النهاية أقل من عداد البداية."
    };
    throw new HttpsError("failed-precondition", messages[failure] || "تعذر إنهاء الوردية.");
  }
  const finalized = result.snapshot.val()?.shiftState?.history?.[shiftId.trim()];
  if (!finalized || finalized.driverId !== driverId || finalized.status !== "ended") {
    throw new HttpsError("internal", "تعذر تأكيد إنهاء الوردية.");
  }
  return finalized;
});
