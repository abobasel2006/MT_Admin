import { db, ref, get, push, runTransaction } from "../firebase.js";

const fleetRef = ref(db, "fleetState");
const shiftRef = ref(db, "shiftState");
const validShiftTypes = new Set(["day", "night"]);

function cleanId(value, label) {
  if (typeof value !== "string") throw new Error(`معرف ${label} غير صالح.`);
  const id = value.trim();
  if (!id || /[.#$\[\]/]/.test(id)) throw new Error(`معرف ${label} غير صالح.`);
  return id;
}

function requiredText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`حقل ${label} مطلوب.`);
  return value.trim();
}

function slotKey(carId, shiftType) {
  if (!validShiftTypes.has(shiftType)) throw new Error("نوع الوردية غير صالح.");
  return `${carId}__${shiftType}`;
}

function emptyFleet() {
  return { drivers: {}, cars: {}, driverAssignmentIndex: {} };
}

function normalizeFleet(value) {
  const state = value || emptyFleet();
  state.drivers ||= {};
  state.cars ||= {};
  state.driverAssignmentIndex ||= {};
  return state;
}

/** Creates a driver with a generated immutable Firebase key. */
export async function createDriver({ name, phone = "", notes = "" }) {
  const driverId = push(ref(db, "drivers")).key;
  if (!driverId) throw new Error("تعذر إنشاء معرف السائق.");
  const record = {
    driverId,
    name: requiredText(name, "اسم السائق"),
    phone: typeof phone === "string" ? phone.trim() : "",
    notes: typeof notes === "string" ? notes.trim() : "",
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    if (state.drivers[driverId]) return;
    state.drivers[driverId] = record;
    return state;
  });
  if (!result.committed) throw new Error("تعذر إنشاء السائق؛ المعرف مستخدم.");
  return record;
}

/** Updates profile fields only; IDs and active state are managed separately. */
export async function updateDriver({ driverId, name, phone, notes }) {
  driverId = cleanId(driverId, "السائق");
  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    const driver = state.drivers[driverId];
    if (!driver) return;
    if (name !== undefined) driver.name = requiredText(name, "اسم السائق");
    if (phone !== undefined) driver.phone = String(phone).trim();
    if (notes !== undefined) driver.notes = String(notes).trim();
    driver.updatedAt = Date.now();
    return state;
  });
  const driver = result.snapshot.val()?.drivers?.[driverId];
  if (!result.committed || !driver) throw new Error("السائق غير موجود أو تعذر تحديثه.");
  return driver;
}

/** Creates a car with a generated immutable Firebase key. */
export async function createCar({ plate, model = "" }) {
  const carId = push(ref(db, "cars")).key;
  if (!carId) throw new Error("تعذر إنشاء معرف السيارة.");
  const record = {
    carId,
    plate: requiredText(plate, "رقم اللوحة"),
    model: typeof model === "string" ? model.trim() : "",
    active: true,
    dayDriverId: null,
    nightDriverId: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    if (state.cars[carId]) return;
    state.cars[carId] = record;
    return state;
  });
  if (!result.committed) throw new Error("تعذر إنشاء السيارة؛ المعرف مستخدم.");
  return record;
}

/** Updates descriptive car fields without changing its stable ID or assignments. */
export async function updateCar({ carId, plate, model }) {
  carId = cleanId(carId, "السيارة");
  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    const car = state.cars[carId];
    if (!car) return;
    if (plate !== undefined) car.plate = requiredText(plate, "رقم اللوحة");
    if (model !== undefined) car.model = String(model).trim();
    car.updatedAt = Date.now();
    return state;
  });
  const car = result.snapshot.val()?.cars?.[carId];
  if (!result.committed || !car) throw new Error("السيارة غير موجودة أو تعذر تحديثها.");
  return car;
}

/**
 * Assigns day/night drivers atomically and maintains a unique driver-to-slot index.
 * Pass null to leave a slot empty. A driver may occupy only one active car slot.
 */
export async function assignCarDrivers({ carId, dayDriverId = null, nightDriverId = null }) {
  carId = cleanId(carId, "السيارة");
  const assignments = {
    day: dayDriverId === null ? null : cleanId(dayDriverId, "السائق"),
    night: nightDriverId === null ? null : cleanId(nightDriverId, "السائق")
  };
  if (assignments.day && assignments.day === assignments.night) {
    throw new Error("لا يمكن تعيين السائق نفسه للوردية النهارية والليلية.");
  }

  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    const car = state.cars[carId];
    if (!car || car.active !== true) return;
    for (const type of ["day", "night"]) {
      const driverId = assignments[type];
      if (driverId && (!state.drivers[driverId] || state.drivers[driverId].active !== true)) return;
      const existingSlot = driverId ? state.driverAssignmentIndex[driverId] : null;
      if (existingSlot && existingSlot !== slotKey(carId, type)) return;
    }
    for (const type of ["day", "night"]) {
      const field = type === "day" ? "dayDriverId" : "nightDriverId";
      const oldDriverId = car[field] || null;
      if (oldDriverId && state.driverAssignmentIndex[oldDriverId] === slotKey(carId, type)) {
        delete state.driverAssignmentIndex[oldDriverId];
      }
      car[field] = assignments[type];
      if (assignments[type]) state.driverAssignmentIndex[assignments[type]] = slotKey(carId, type);
    }
    car.updatedAt = Date.now();
    return state;
  });

  if (!result.committed) {
    throw new Error("تعذر التعيين: تحقق من نشاط السيارة والسائقين، ومن عدم تعيين السائق في خانة أخرى.");
  }
  return result.snapshot.val().cars[carId];
}

/** Soft-disables a driver. Hard deletion is intentionally not supported. */
export async function deactivateDriver({ driverId }) {
  driverId = cleanId(driverId, "السائق");
  const activeShift = (await get(ref(db, `shiftState/activeByDriver/${driverId}`))).val();
  if (activeShift) throw new Error("لا يمكن تعطيل سائق لديه وردية نشطة.");
  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    const driver = state.drivers[driverId];
    if (!driver) return;
    if (state.driverAssignmentIndex[driverId]) return;
    driver.active = false;
    driver.updatedAt = Date.now();
    return state;
  });
  const driver = result.snapshot.val()?.drivers?.[driverId];
  if (!result.committed || !driver || driver.active !== false) {
    throw new Error("السائق غير موجود أو ما زال معيناً إلى سيارة.");
  }
  return driver;
}

/** Soft-disables a car after checking both active shift slots. */
export async function deactivateCar({ carId }) {
  carId = cleanId(carId, "السيارة");
  const [dayShift, nightShift] = await Promise.all([
    get(ref(db, `shiftState/activeByCar/${slotKey(carId, "day")}`)),
    get(ref(db, `shiftState/activeByCar/${slotKey(carId, "night")}`))
  ]);
  if (dayShift.val() || nightShift.val()) throw new Error("لا يمكن تعطيل سيارة لديها وردية نشطة.");
  const result = await runTransaction(fleetRef, current => {
    const state = normalizeFleet(current);
    const car = state.cars[carId];
    if (!car) return;
    car.active = false;
    for (const type of ["day", "night"]) {
      const field = type === "day" ? "dayDriverId" : "nightDriverId";
      const driverId = car[field];
      if (driverId && state.driverAssignmentIndex[driverId] === slotKey(carId, type)) {
        delete state.driverAssignmentIndex[driverId];
      }
      car[field] = null;
    }
    car.updatedAt = Date.now();
    return state;
  });
  const car = result.snapshot.val()?.cars?.[carId];
  if (!result.committed || !car || car.active !== false) {
    throw new Error("السيارة غير موجودة أو تعذر تعطيلها.");
  }
  return car;
}
