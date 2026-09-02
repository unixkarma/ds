# Guía de testing — Contabilidad / Pagos

Guía corta para QA del flujo financiero (pagos, créditos de lecciones, reportes).
Toda la verificación es **por UI**. No requiere acceso a Supabase ni Stripe Dashboard salvo que se indique.

---

## Pre-requisitos

- URL del entorno: `_____________________`
- Credenciales de testing (mismas que `TESTING.md`):

| Rol     | Email                       | Password   |
| ------- | --------------------------- | ---------- |
| Admin   | `admin63@helixdriving.com`  | `$SEED_PASSWORD` |
| Student | `sofia.ramirez@gmail.com`   | `$SEED_PASSWORD` |

- Calculadora a mano para verificar totales.
- Para los tests de Stripe (Bloque C), tener tarjeta de prueba Stripe: `4242 4242 4242 4242`, fecha futura, CVC cualquiera, ZIP cualquiera.

---

# 🧪 Bloque A — Pago manual (cash / check / other)

> Logueate como **Admin**. El admin registra un pago en efectivo o cheque y se acreditan lessons al student.

### A1 — Registrar pago manual por package

**Pasos:**
1. Andá a `/dashboard/students` → click sobre el student de testing.
2. Anotá los valores actuales: **Lessons Purchased**, **Lessons Completed**, **Lessons Remaining**.
3. Click en el botón **"Record Payment"** (o equivalente "Add Manual Payment").
4. Elegir un **package** existente (ej. "Pack 5 lessons").
5. Payment method: **Cash**.
6. Confirmar.

**Esperado:**
- ✅ Toast verde de confirmación.
- ✅ **Lessons Remaining** sube exactamente por el `lesson_count` del package.
- ✅ **Lessons Purchased** sube por la misma cantidad.
- ✅ **Lessons Completed** NO cambia.

### A2 — Registrar pago manual con monto custom

**Pasos:**
1. Mismo flujo que A1, pero en lugar de elegir un package, ingresar:
   - **Lesson count**: `3`
   - **Amount**: `$150.00`
   - **Payment method**: `Check`
2. Confirmar.

**Esperado:**
- ✅ Lessons Remaining sube en 3.
- ✅ El pago aparece en `/dashboard/payments` con monto `$150.00`, método `check`, status `completed`.

### A3 — Validación: lesson count = 0

**Pasos:**
1. Intentar registrar un pago manual con **lesson count = 0** y monto cualquiera.

**Esperado:**
- ✅ Aparece error de validación. El pago NO se crea.
- ✅ Lessons Remaining no cambia.

---

# 🧪 Bloque B — Lista de pagos (`/dashboard/payments`)

> Logueate como **Admin**. Andá a `/dashboard/payments`.

### B1 — Verificar totales

**Pasos:**
1. Anotar los valores de las 3 cards: **Total Revenue**, **Total Payments**, **Completed**.
2. Sumar manualmente con calculadora los `Amount` de las filas con badge **completed**.

**Esperado:**
- ✅ La suma manual coincide con **Total Revenue**.
- ✅ **Total Payments** = cantidad total de filas (todos los status).
- ✅ **Completed** = cantidad de filas con status `completed`.
- ✅ Pagos `pending`, `refunded` o `failed` NO suman a Total Revenue.

### B2 — Verificar columnas

**Esperado por fila:**
- ✅ Columna **Student**: nombre completo del student.
- ✅ Columna **Package**: nombre del package, o "Single Lesson" si el pago no tiene package.
- ✅ Columna **Amount**: formato `$X.XX` (2 decimales).
- ✅ Columna **Status**: badge con color (completed verde/default, pending outline, refunded gris, failed rojo).
- ✅ Columna **Date**: formato `MMM d, yyyy` (ej. "May 7, 2026").

---

# 🧪 Bloque C — Pago con Stripe (student → admin)

> Logueate como **Student**. Andá a `/student/packages`.

### C1 — Compra de package con tarjeta de prueba

**Pasos:**
1. Anotar Lessons Remaining actuales en `/student/account`.
2. Ir a `/student/packages`, elegir un package, click **"Buy"** / **"Checkout"**.
3. En Stripe Checkout: tarjeta `4242 4242 4242 4242`, fecha futura, CVC cualquiera.
4. Confirmar el pago. Esperar el redirect.

**Esperado student-side:**
- ✅ Redirect a página de éxito.
- ✅ En `/student/account`: **Lessons Remaining** subió por `lesson_count` del package.
- ✅ En **Payment History**: aparece el pago con method = `Card`, **Visa •••• 4242**, link **"Receipt"** clickeable.

**Esperado admin-side:**
1. Logueate como Admin → `/dashboard/payments`.
2. ✅ El pago aparece en la tabla, status `completed`, monto correcto.
3. ✅ **Total Revenue** subió por el monto del package.

### C2 — Tarjeta rechazada (regresión)

**Pasos:**
1. Repetir C1 con tarjeta `4000 0000 0000 0002` (Stripe test card de "card declined").

**Esperado:**
- ✅ Stripe muestra el rechazo y el pago no se completa.
- ✅ Lessons Remaining del student NO cambia.
- ✅ NO aparece un nuevo pago `completed` en `/dashboard/payments` (puede haber uno `failed` o `pending`, pero no `completed`).

---

# 🧪 Bloque D — Reportes (`/dashboard/reports`)

> Logueate como **Admin**. Andá a `/dashboard/reports`.

### D1 — Tab Revenue

**Esperado:**
- ✅ Total revenue coincide con `/dashboard/payments` Total Revenue.
- ✅ Breakdown por package suma al total.
- ✅ Filtros de fecha (si existen) reducen el total correctamente.

### D2 — Tab Instructor Payroll

**Pasos:**
1. Anotar para 1 instructor activo: cantidad de lessons completed × rate por hora.

**Esperado:**
- ✅ El cálculo del reporte coincide con la cuenta manual (lessons × duración × rate).
- ✅ Lessons `cancelled` NO se cuentan en payroll.

### D3 — Tab Lessons

**Esperado:**
- ✅ Counts de completed vs cancelled vs scheduled coinciden con `/dashboard/schedule`.

---

# 🧪 Bloque E — Coherencia cruzada

Tests rápidos que tocan varios módulos a la vez. Hacer al final.

### E1 — Pago manual → reportes

**Pasos:**
1. Registrar un pago manual de `$200.00` (Bloque A1).
2. Ir a `/dashboard/payments` → confirmar Total Revenue subió `$200`.
3. Ir a `/dashboard/reports` tab Revenue → confirmar mismo aumento.
4. Logueate como el student afectado → `/student/account` → confirmar pago en Payment History con method `Cash`.

**Esperado:**
- ✅ Los 3 lugares (payments admin, reports, account student) muestran el mismo pago con el mismo monto.

### E2 — Cambio de precio de package

**Pasos:**
1. Anotar el `price_cents` actual de un package en `/dashboard/packages`.
2. Editarlo, subirlo (ej. de $100 a $120). Guardar.
3. Ir a `/dashboard/payments` y mirar pagos viejos de ese package.

**Esperado:**
- ✅ Los pagos históricos mantienen su monto original ($100), NO se actualizan al nuevo precio.
- ✅ Una compra nueva del package usa el precio nuevo ($120).

---

## Checklist final

- [ ] Bloque A — Pago manual
- [ ] Bloque B — Lista de pagos
- [ ] Bloque C — Stripe checkout
- [ ] Bloque D — Reportes
- [ ] Bloque E — Coherencia cruzada

Reportar bugs con: paso exacto que falló, valor esperado vs valor visto, y screenshot si es posible.
