import { app, db, ref, onValue, auth, functions, signInWithCustomToken, setPersistence, browserSessionPersistence, httpsCallable } from "./src/firebase.js";
import { createDriver, updateDriver, createCar, updateCar, assignCarDrivers, deactivateDriver, deactivateCar } from "./src/domain/fleet-service.js";
const $ = s => document.querySelector(s);
const loginAdminWithPin = httpsCallable(functions, "loginAdminWithPin");
const setDriverPin = httpsCallable(functions, "setDriverPin");

async function ensureAdminSession() {
  const current = auth.currentUser;
  if (current) {
    const token = await current.getIdTokenResult();
    if (token.claims.role === "admin") return;
  }
  const adminPin = window.prompt("أدخل رمز الإدارة لتأكيد العملية:");
  if (adminPin === null) throw new Error("تم إلغاء العملية.");
  if (!/^\\d{4}$/.test(adminPin)) throw new Error("رمز الإدارة يجب أن يتكون من أربعة أرقام.");
  const result = await loginAdminWithPin({ pin: adminPin });
  await setPersistence(auth, browserSessionPersistence);
  await signInWithCustomToken(auth, result.data.token);
}
const state = { drivers: {}, cars: {}, shifts: {} };
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const activeDrivers = () => Object.entries(state.drivers).filter(x => x[1] && x[1].active === true);
function note(message, bad) { $("#notice").textContent = message; $("#notice").dataset.kind = bad ? "error" : "success"; }
async function act(fn) { try { await unlockAdminWorkspace(); await fn(); } catch (e) { console.error(e); note(e.message || "تعذر تنفيذ العملية.", true); } }
function options(selected) {
  return '<option value="">— بدون سائق —</option>' + activeDrivers().map(([id,d]) => '<option value="' + esc(id) + '"' + (id === selected ? ' selected' : '') + '>' + esc(d.name) + ' — ' + esc(id.slice(-5)) + '</option>').join("");
}
function render() {
  $("#driverCount").textContent = Object.keys(state.drivers).length;
  $("#carCount").textContent = Object.keys(state.cars).length;
  $("#driversList").innerHTML = Object.entries(state.drivers).map(([id,d]) =>
    '<article class="item-card ' + (d.active ? '' : 'inactive') + '"><div class="item-head"><div><strong>' + esc(d.name) + '</strong><small>معرّف ثابت: ' + esc(id) + '</small></div><span class="pill ' + (d.active ? 'good' : '') + '">' + (d.active ? 'نشط' : 'معطّل') + '</span></div><p class="muted">' + esc(d.phone || 'لا يوجد هاتف') + '</p>' +
    (d.active ? '<div class="inline-fields"><input data-name="' + esc(id) + '" value="' + esc(d.name) + '" aria-label="اسم السائق"><input data-phone="' + esc(id) + '" value="' + esc(d.phone || '') + '" placeholder="الهاتف"><button class="secondary" data-save-driver="' + esc(id) + '">حفظ التعديل</button><button class="secondary" data-set-pin="' + esc(id) + '">تعيين PIN</button><button class="danger" data-disable-driver="' + esc(id) + '">تعطيل</button></div>' : '') + '</article>'
  ).join("") || '<p class="empty">لا يوجد سائقون بعد.</p>';
  $("#carsList").innerHTML = Object.entries(state.cars).map(([id,c]) =>
    '<article class="item-card ' + (c.active ? '' : 'inactive') + '"><div class="item-head"><div><strong>' + esc(c.plate) + '</strong><small>' + esc(c.model || 'دون موديل') + ' · معرّف: ' + esc(id) + '</small></div><span class="pill ' + (c.active ? 'good' : '') + '">' + (c.active ? 'نشطة' : 'معطّلة') + '</span></div>' +
    '<div class="assignment-grid"><label>السائق النهاري<select data-day="' + esc(id) + '"' + (c.active ? '' : ' disabled') + '>' + options(c.dayDriverId) + '</select></label><label>السائق الليلي<select data-night="' + esc(id) + '"' + (c.active ? '' : ' disabled') + '>' + options(c.nightDriverId) + '</select></label></div>' +
    (c.active ? '<div class="inline-fields"><input data-plate="' + esc(id) + '" value="' + esc(c.plate) + '" aria-label="لوحة السيارة"><input data-model="' + esc(id) + '" value="' + esc(c.model || '') + '" placeholder="الموديل"><button class="secondary" data-save-car="' + esc(id) + '">حفظ السيارة</button><button class="danger" data-disable-car="' + esc(id) + '">تعطيل السيارة</button></div>' : '') + '</article>'
  ).join("") || '<p class="empty">لا توجد سيارات بعد.</p>';
}
$("#driverForm").addEventListener("submit", e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); act(async () => { await createDriver({name:d.get("name"),phone:d.get("phone"),notes:d.get("notes")}); form.reset(); note("تم إنشاء السائق."); }); });
$("#carForm").addEventListener("submit", e => { e.preventDefault(); const form = e.currentTarget; const d = new FormData(form); act(async () => { await createCar({plate:d.get("plate"),model:d.get("model")}); form.reset(); note("تمت إضافة السيارة."); }); });
document.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.saveDriver || b.dataset.disableDriver || b.dataset.saveCar || b.dataset.disableCar || b.dataset.setPin; if (!id) return;
  if (b.dataset.setPin) act(async () => {
    const pin = window.prompt("أدخل PIN جديداً للسائق (أربعة أرقام):");
    if (pin === null) return;
    if (!/^\\d{4}$/.test(pin)) throw new Error("PIN يجب أن يتكون من أربعة أرقام بالضبط.");
    await setDriverPin({ driverId: id, pin });
    note("تم تعيين PIN للسائق بنجاح.");
  });
  if (b.dataset.saveDriver) act(async () => { await updateDriver({driverId:id,name:document.querySelector('[data-name="' + CSS.escape(id) + '"]').value,phone:document.querySelector('[data-phone="' + CSS.escape(id) + '"]').value}); note("تم تحديث بيانات السائق."); });
  if (b.dataset.disableDriver && confirm("سيتم تعطيل السائق دون حذف سجلاته. متابعة؟")) act(async () => { await deactivateDriver({driverId:id}); note("تم تعطيل السائق."); });
  if (b.dataset.saveCar) act(async () => { await updateCar({carId:id,plate:document.querySelector('[data-plate="' + CSS.escape(id) + '"]').value,model:document.querySelector('[data-model="' + CSS.escape(id) + '"]').value}); note("تم تحديث السيارة."); });
  if (b.dataset.disableCar && confirm("سيتم تعطيل السيارة وفك تعيين سائقيها دون حذف السجلات. متابعة؟")) act(async () => { await deactivateCar({carId:id}); note("تم تعطيل السيارة."); });
});
document.addEventListener("change", e => {
  const el = e.target, id = el.dataset.day || el.dataset.night; if (!id) return;
  act(async () => { const car = state.cars[id]; const day = el.dataset.day ? (el.value || null) : (car.dayDriverId || null); const night = el.dataset.night ? (el.value || null) : (car.nightDriverId || null); await assignCarDrivers({carId:id,dayDriverId:day,nightDriverId:night}); note("تم حفظ تعيين السائقين."); });
});
$("#refreshBtn").addEventListener("click", () => location.reload());



// متابعة الورديات النشطة — عرض فقط؛ الإنهاء يبقى من حساب السائق.
const formatDate = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "غير متاح";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(n));
};
function renderShifts() {
  const active = Object.entries(state.shifts?.history || {})
    .filter(([, shift]) => shift && shift.status === "active")
    .sort((a, b) => Number(b[1].startedAt || 0) - Number(a[1].startedAt || 0));
  $("#activeShiftCount").textContent = String(active.length);
  $("#activeShiftsList").innerHTML = active.map(([id, shift]) => {
    const driver = state.drivers[shift.driverId];
    const car = state.cars[shift.carId];
    const type = shift.shiftType === "day" ? "نهارية" : shift.shiftType === "night" ? "ليلية" : "غير محددة";
    return '<article class="item-card"><div class="item-head"><div><strong>' + esc(driver?.name || "سائق غير معروف") + '</strong><small>معرّف الوردية: ' + esc(id) + '</small></div><span class="pill good">نشطة</span></div>' +
      '<div class="shift-details"><span>السيارة: <b>' + esc(car?.plate || shift.carId || "غير معروفة") + '</b></span><span>الوردية: <b>' + type + '</b></span><span>بداية الوردية: <b>' + esc(formatDate(shift.startedAt)) + '</b></span><span>عداد البداية: <b>' + esc(shift.startOdometer ?? "غير مسجل") + '</b></span></div>' +
      '<p class="shift-note">إنهاء الوردية يتم من حساب السائق المسجّل عليها.</p></article>';
  }).join("") || '<p class="empty">لا توجد ورديات نشطة حالياً، أو لم تصل بيانات الورديات بعد.</p>';
}



let adminListenersStarted = false;
async function unlockAdminWorkspace() {
  await ensureAdminSession();
  if (adminListenersStarted) return;
  adminListenersStarted = true;
  $("#unlockAdminBtn").textContent = "الإدارة مفتوحة";
  $("#unlockAdminBtn").disabled = true;
  onValue(ref(db,"fleetState"), snap => {
  const v = snap.val() || {}; state.drivers = v.drivers || {}; state.cars = v.cars || {};
  $("#connection").textContent = "تحديث مباشر لبيانات الأسطول.";
  $("#connection").dataset.state = "ready"; render();
}, err => { $("#connection").textContent = "تعذرت قراءة بيانات الأسطول. تحقق من قواعد Firebase."; $("#connection").dataset.state = "locked"; note(err.message || "فشل تحميل البيانات.",true); console.error(err); });
  onValue(ref(db, "shiftState"), snap => {
  state.shifts = snap.val() || {};
  $("#shiftConnection").textContent = "تم تحديث بيانات الورديات.";
  $("#shiftConnection").dataset.state = "ready";
  renderShifts();
}, err => {
  $("#shiftConnection").textContent = "تعذرت قراءة الورديات. تحقق من صلاحيات قاعدة Firebase.";
  $("#shiftConnection").dataset.state = "locked";
  $("#activeShiftsList").innerHTML = '<p class="empty">لا يمكن عرض الورديات قبل منح صلاحية القراءة المناسبة.</p>';
  console.error("shiftState listener:", err);
});
}
$("#unlockAdminBtn").addEventListener("click", () => {
  unlockAdminWorkspace().catch(error => note(error.message || "تعذر فتح بيانات الإدارة.", true));
});
