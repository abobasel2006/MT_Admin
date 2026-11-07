const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

initializeApp();
const database = getDatabase();

const crypto = require("node:crypto");
const { defineSecret } = require("firebase-functions/params");
const pinPepper = defineSecret("MT_TAXI_PIN_PEPPER");
const adminPinSecret = defineSecret("MT_TAXI_ADMIN_PIN");

function pinDigest(pin, salt, pepper) {
  return crypto.scryptSync(pin, Buffer.concat([Buffer.from(salt, "hex"), Buffer.from(pepper)]), 64).toString("hex");
}

function requireFourDigitPin(pin) {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new HttpsError("invalid-argument", "رمز PIN يجب أن يتكون من أربعة أرقام فقط.");
  }
}

exports.setDriverPin = onCall({ region: "europe-west1", secrets: [pinPepper] }, async (request) => {
  requireIdentity(request, "admin");
  const { driverId, pin } = request.data || {};
  requireFourDigitPin(pin);
  if (typeof driverId !== "string" || !driverId.trim()) {
    throw new HttpsError("invalid-argument", "معرّف السائق غير صحيح.");
  }
  const driverRef = database.ref("fleetState/drivers/" + driverId.trim());
  const driverSnap = await driverRef.get();
  if (!driverSnap.exists() || driverSnap.val()?.active !== true) {
    throw new HttpsError("not-found", "السائق غير موجود أو غير نشط.");
  }
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = pinDigest(pin, salt, pinPepper.value());
  await database.ref("security/driverPins/" + driverId.trim()).set({
    salt, hash, updatedAt: Date.now(), version: 1
  });
  await database.ref("security/pinAttempts/" + driverId.trim()).remove();
  return { success: true };
});

exports.loginWithPin = onCall({ region: "europe-west1", secrets: [pinPepper] }, async (request) => {
  const { driverId, pin } = request.data || {};
  requireFourDigitPin(pin);
  if (typeof driverId !== "string" || !driverId.trim()) {
    throw new HttpsError("invalid-argument", "بيانات الدخول غير صحيحة.");
  }
  const id = driverId.trim();
  const [driverSnap, pinSnap, attemptsSnap] = await Promise.all([
    database.ref("fleetState/drivers/" + id).get(),
    database.ref("security/driverPins/" + id).get(),
    database.ref("security/pinAttempts/" + id).get()
  ]);
  const driver = driverSnap.val();
  const stored = pinSnap.val();
  const attempts = attemptsSnap.val() || {};
  const now = Date.now();

  if (!driver || driver.active !== true || !stored?.salt || !stored?.hash) {
    throw new HttpsError("permission-denied", "اسم السائق أو الرمز غير صحيح.");
  }
  if (Number(attempts.lockUntil || 0) > now) {
    throw new HttpsError("resource-exhausted", "تم إيقاف المحاولة مؤقتاً. حاول لاحقاً.");
  }

  const calculated = pinDigest(pin, stored.salt, pinPepper.value());
  const expected = Buffer.from(stored.hash, "hex");
  const actual = Buffer.from(calculated, "hex");
  const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

  if (!matches) {
    await database.ref("security/pinAttempts/" + id).transaction(current => {
      const state = current || { failures: 0, lockUntil: 0 };
      if (Number(state.lockUntil || 0) > Date.now()) return state;
      const failures = Number(state.failures || 0) + 1;
      return {
        failures: failures >= 5 ? 0 : failures,
        lockUntil: failures >= 5 ? Date.now() + 15 * 60 * 1000 : 0
      };
    }, undefined, false);
    throw new HttpsError("permission-denied", "اسم السائق أو الرمز غير صحيح.");
  }

  await database.ref("security/pinAttempts/" + id).remove();
  const token = await require("firebase-admin/auth").getAuth().createCustomToken(id, {
    role: "driver", driverId: id
  });
  return { token };
});


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


// Temporary admin step-up authentication. The PIN is supplied only through
// Secret Manager; it is never embedded in browser assets or repository files.
exports.loginAdminWithPin = onCall(
  { region: "europe-west1", secrets: [adminPinSecret] },
  async (request) => {
    const supplied = request.data?.pin;
    if (typeof supplied !== "string" || !/^\d{4}$/.test(supplied)) {
      throw new HttpsError("invalid-argument", "رمز الإدارة يجب أن يتكون من أربعة أرقام.");
    }

    const ip = String(request.rawRequest?.ip || "unknown");
    const ipKey = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 40);
    const attemptRef = database.ref("security/adminPinAttempts/" + ipKey);
    const now = Date.now();
    let blocked = false;

    const attemptResult = await attemptRef.transaction(current => {
      const state = current || { failures: 0, windowStartedAt: now, lockUntil: 0 };
      if (Number(state.lockUntil || 0) > now) {
        blocked = true;
        return;
      }
      const windowExpired = now - Number(state.windowStartedAt || 0) > 15 * 60 * 1000;
      const failures = windowExpired ? 1 : Number(state.failures || 0) + 1;
      return {
        failures: failures >= 5 ? 0 : failures,
        windowStartedAt: windowExpired ? now : Number(state.windowStartedAt || now),
        lockUntil: failures >= 5 ? now + 15 * 60 * 1000 : 0
      };
    }, undefined, false);

    if (blocked || !attemptResult.committed) {
      throw new HttpsError("resource-exhausted", "محاولات كثيرة. أعد المحاولة بعد 15 دقيقة.");
    }

    const expected = Buffer.from(adminPinSecret.value(), "utf8");
    const actual = Buffer.from(supplied, "utf8");
    const matches = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    if (!matches) {
      throw new HttpsError("permission-denied", "رمز الإدارة غير صحيح.");
    }

    await attemptRef.remove();
    const token = await require("firebase-admin/auth").getAuth().createCustomToken("mt-taxi-admin", {
      role: "admin"
    });
    return { token };
  }
);


// Minimal public roster used only to let a driver identify their assigned
// vehicle/shift before PIN verification. No phone numbers, notes, or inactive
// records are returned. The PIN remains the actual login credential.
exports.listDriverLoginOptions = onCall({ region: "europe-west1" }, async () => {
  const [driversSnap, carsSnap] = await Promise.all([
    database.ref("fleetState/drivers").get(),
    database.ref("fleetState/cars").get()
  ]);
  const drivers = driversSnap.val() || {};
  const cars = carsSnap.val() || {};
  const options = [];
  for (const [carId, car] of Object.entries(cars)) {
    if (!car || car.active !== true) continue;
    for (const shiftType of ["day", "night"]) {
      const driverId = car[shiftType === "day" ? "dayDriverId" : "nightDriverId"];
      const driver = driverId ? drivers[driverId] : null;
      if (!driver || driver.active !== true) continue;
      options.push({
        driverId, driverName: String(driver.name || "سائق"),
        carId, plate: String(car.plate || ""), shiftType
      });
    }
  }
  return { options };
});

exports.getMyActiveShift = onCall({ region: "europe-west1" }, async (request) => {
  const claims = requireIdentity(request, "driver");
  const driverId = String(claims.driverId);
  const [indexSnap, historySnap] = await Promise.all([
    database.ref("shiftState/activeByDriver/" + driverId).get(),
    database.ref("shiftState/history").get()
  ]);
  const shiftId = indexSnap.val();
  const shift = shiftId ? historySnap.child(shiftId).val() : null;
  if (!shift || shift.status !== "active" || shift.driverId !== driverId) return { shift: null };
  return { shift };
});
