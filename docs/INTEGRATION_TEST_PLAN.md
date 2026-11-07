# MT TAXI 2.0 — خطة اختبار التكامل

هذه الخطة مخصصة لفرع التطوير `mt-taxi-2.0` فقط. لا تنفذ الاختبارات على قاعدة الإنتاج القديمة.

## توافق نموذج البيانات

- إعداد Firebase في تطبيقي السائقين والإدارة يجب أن يشير إلى المشروع `mt-taxi-20` وقاعدة Realtime Database في `europe-west1`.
- بيانات الأسطول: `fleetState/drivers`, `fleetState/cars`, `fleetState/driverAssignmentIndex`.
- حجوزات الورديات: `shiftState/activeByCar`, `shiftState/activeByDriver`.
- سجل الورديات: `shiftState/history`.
- معرّف السائق والسيارة هما مفاتيح ثابتة؛ لا تستخدم الاسم أو رقم اللوحة كمفتاح.

## اختبارات مطلوبة في بيئة اختبار معزولة

1. إنشاء سائق وسيارة من لوحة الإدارة، ثم التحقق من ظهورهما في تطبيق السائقين.
2. تعيين سائق للوردية النهارية وآخر لليلية في السيارة نفسها، والتحقق من ظهور التعيينين.
3. محاولة تعيين السائق نفسه في خانتين؛ يجب رفض العملية.
4. بدء وردية نهارية وليلية للسيارة نفسها بسائقين مختلفين؛ يجب نجاحهما.
5. محاولة بدء ورديتين للسائق نفسه؛ يجب رفض العملية.
6. إنهاء الوردية بقراءة عداد أقل من البداية؛ يجب رفضها.
7. إنهاء الوردية بقيمة صحيحة؛ يجب تحرير حجزي السيارة والسائق وتحديث سجل التاريخ.
8. التأكد من تحديث لوحة الإدارة وتطبيق السائقين تلقائياً بعد تغير البيانات.
9. إعادة تحميل التطبيقين أثناء وجود وردية نشطة؛ يجب استعادة حالة الوردية من قاعدة البيانات.

## حواجز قبل الإنتاج

- لا تعتبر اختيار اسم السائق وتخزين الجلسة المحلية مصادقة. يمكن للمستخدم تعديل بيانات المتصفح.
- لا تمنح صلاحيات الكتابة اعتماداً على `driverId` أو `role` يرسله العميل.
- يلزم Backend موثوق (مثل Cloud Functions) للتحقق من الهوية والتعيينات وتنسيق عمليات الأسطول والورديات ذرياً.
- فحوصات تعطيل السائق/السيارة تقرأ `shiftState` ثم تعدّل `fleetState` في عمليتين منفصلتين؛ توجد نافذة سباق يجب إغلاقها في Backend.
- لا تفتح قواعد Firebase للعامة بغرض تجاوز أخطاء القراءة.
- لم تُنفذ هذه الاختبارات على قاعدة Firebase الحقيقية، ولم يتم النشر أو الدمج.

## نتيجة المراجعة الساكنة

- تم التأكد من وجود صادرات Firebase المطلوبة في `src/firebase.js` بما فيها `db`, `ref`, `get`, `onValue`, `push`, `runTransaction`.
- تم توحيد معالجة نتيجة إنهاء الوردية لتقرأ السجل النهائي من لقطة المعاملة بدلاً من الاعتماد على متغير خارجي يتغير داخل callback.
- يلزم تشغيل اختبارات المتصفح وقاعدة الاختبار بعد إعداد قواعد وصول آمنة.


## V2 authenticated backend acceptance cases

### Admin access without a login landing screen
- Open the management URL in a clean browser session: the page must render without prompting for a PIN.
- Before unlocking, no fleet or shift data is returned; RTDB reads are denied.
- Select **فتح بيانات الإدارة**: the operator is prompted for the temporary admin PIN.
- A valid PIN produces a Firebase custom-token session with server-issued `role=admin`; an invalid PIN is rejected.
- Five invalid attempts from one IP trigger a 15-minute cooldown.
- After unlock, fleet data loads; the lock control signs out and reloads the page.
- Without an admin claim, every admin callable and every fleet/shift read must be denied.
- App Check missing/invalid token must be rejected by every callable.

### Driver PIN flow
- The roster callable returns only active driver assignments (no phone or notes).
- Correct four-digit PIN authenticates the selected driver and creates a custom-token session with server-issued `role=driver` and matching `driverId`.
- Wrong PIN, inactive driver, missing PIN, and malformed IDs are rejected.
- Leading-zero PINs (for example `0047`) are preserved exactly.
- Five failed attempts for one driver cause a 15-minute lockout.
- A client cannot substitute another driver ID after authentication; shift functions use the token claim.

### Server-side fleet operations
- Admin-only create/update/assign/deactivate callables succeed with an admin claim and fail without it.
- A driver token cannot create or modify fleet data.
- Duplicate day/night assignments are rejected.
- A driver with an active shift cannot be reassigned or deactivated.
- A car with an active day/night shift cannot be deactivated.
- Direct client writes to `fleetState` and `shiftState` are rejected.

### Shift lifecycle
- Simultaneous starts for the same driver: exactly one succeeds.
- Different drivers can start day and night shifts for the same car concurrently.
- The same car/shift slot cannot be reserved twice.
- Wrong-driver end attempts are rejected.
- Duplicate end requests are idempotent.
- End odometer below start odometer is rejected.
- Admin can read shift status but cannot write shift state directly.

### Release gate
Do not mark any case as passed until it is executed against the Firebase Emulator Suite or isolated staging project and its result is recorded. GitHub static syntax validation alone is not an integration test.
