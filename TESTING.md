# Guía de testing — HelixDriving

Guía paso a paso para probar el sistema, **especialmente los updates recientes** del Step 13 (Templates, Schedule, Openings, Buffer y Cancel).

Toda la verificación es **por UI**. No requiere acceso a Supabase ni SQL.

---

## Pre-requisitos

- URL del entorno (preview o prod): `_____________________`
- Navegador moderno (Chrome/Firefox/Edge).
- Las 3 cuentas de la tabla de abajo, ya creadas.

## Credenciales

| Rol         | Nombre que verás en UI | Email                              | Password   |
| ----------- | ---------------------- | ---------------------------------- | ---------- |
| Admin       | (admin)                | `admin63@helixdriving.com`         | `$SEED_PASSWORD` |
| Instructor  | Carlos Martinez        | `carlos.martinez@helixdriving.com` | `$SEED_PASSWORD` |
| Student     | Sofia Ramirez          | `sofia.ramirez@gmail.com`          | `$SEED_PASSWORD` |

> Las passwords las define `SEED_PASSWORD` al correr `scripts/seed.ts` (default `ChangeMe123!`).
> Solo para preview/QA — rotalas o borrá estas cuentas antes de onboardear clientes reales.

> Si necesitás crear users de testing nuevos, mirá la sección **"Crear users de testing"** al final.

## Configuración inicial requerida

Antes de empezar, logueate como **Admin** una vez para confirmar:

1. **Carlos Martinez** existe en `/dashboard/instructors` y está **Activo**.
2. El **Student de testing** existe en `/dashboard/students` y tiene **al menos 5 lessons remaining** (si no, andá a `/dashboard/payments` o usá el botón de créditos manuales).
3. En `/dashboard/settings` → tab **Stripe**, no es necesario tener Stripe configurado para esta guía (no testeamos el flujo de pago).

---

# 🧪 Bloque A — Templates & Schedule

> Logueate como **Carlos Martinez** (instructor). Andá a `/instructor/availability`.

### A1 — Crear un template nuevo

**Pasos:**
1. Tab **Templates** → botón **"New Template"** (arriba a la derecha).
2. Completar:
   - **Name**: `Test Mañanas`
   - **Days**: dejar Mon–Fri seleccionados (default).
   - **Slots**: agregar 1 slot a las **09:00, 60 min**. Click "Add slot" → segundo slot **11:00, 60 min**.
3. Click **"Create Template"**.

**Esperado:**
- ✅ El template aparece en "My custom templates" con la card mostrando "Mon–Fri · 2 slots per day" y dos badges 09:00–10:00, 11:00–12:00.
- ✅ Al ir al tab **"Upcoming Openings"**, los próximos 14 días Mon–Fri muestran 2 slots cada uno (09:00 y 11:00). Sat y Sun aparecen sin openings.

### A2 — Validación: slots duplicados

**Pasos:**
1. Click en el ✏️ del template "Test Mañanas".
2. Click "Add slot" → poné **start = 09:00** (igual al primero).
3. Click **"Save Changes"**.

**Esperado:**
- ✅ Aparece un Alert rojo arriba: *"Duplicate slot at 09:00. Each start time must be unique within a template."*
- ✅ El template NO se guarda hasta que cambies o elimines el slot duplicado.

### A3 — Validación: buffer entre slots

**Pasos:**
1. Andá al tab **Templates** → bajá hasta la sección **Preferences**.
2. Cambiá el Select **"Buffer between lessons"** a **15 min** → click **Save**.
3. Volvé a editar el template "Test Mañanas".
4. Cambiá el segundo slot a **start = 10:00, duration = 60min** (queda pegado al primero, gap = 0).
5. Click **"Save Changes"**.

**Esperado:**
- ✅ Aparece un Alert rojo: *"Need 15min buffer between 09:00 and 10:00 (only 0min apart)."*
- ✅ Al lado del label **"Slots"** ahora se ve un texto chico: *"15min buffer required between slots"*.
- ✅ Si cambiás el segundo slot a **10:15** (gap = 15min), el guardado funciona.

### A4 — Days off

**Pasos:**
1. Tab **Days Off** → poner una **fecha futura dentro de los próximos 14 días** (ej. el próximo lunes).
2. Reason opcional: `Vacaciones`.
3. Click **Add**.

**Esperado:**
- ✅ Aparece toast verde "Day off added".
- ✅ La fecha aparece en la lista "Upcoming days off".
- ✅ Al ir al tab **"Upcoming Openings"**, ese día tiene un badge gris "off" y dice "Day off" en lugar de los slots.

### A5 — Eliminar template

**Pasos:**
1. Tab **Templates** → 🗑️ del template "Test Mañanas" → confirmar **Delete**.

**Esperado:**
- ✅ Toast "Template removed and openings regenerated".
- ✅ El template desaparece.
- ✅ En **Upcoming Openings**, los 14 días pierden los slots 09:00 y 11:00 que generaba ese template.

---

# 🧪 Bloque B — Admin booking & auto-block

> Logueate como **Admin**. Andá a `/dashboard/schedule`.

### Setup B

Antes de los tests del bloque B, **como Carlos** creá de nuevo un template `Test Mañanas` con slots **09:00, 11:00** (60min) Mon–Fri y **buffer = 0** (Preferences). Esto nos da openings limpios para testear.

### B1 — Booking sobre opening exacto (auto-link)

**Pasos:**
1. En `/dashboard/schedule` como admin, navegá a un día Mon–Fri donde Carlos tenga el slot **09:00 verde dashed** ("Open").
2. Click **"Book Lesson"** → completar:
   - Instructor: **Carlos Martinez**
   - Student: el de testing
   - Day + Time: **el mismo día, 09:00**, duración **60 min**.
   - Pickup/Dropoff: cualquier dirección con ZIP.
3. Confirmar.

**Esperado:**
- ✅ El lesson se crea (toast verde).
- ✅ El slot 09:00, antes verde dashed, ahora se ve **sólido azul (lesson)**. El opening verde desaparece.

### B2 — Booking con overlap parcial (auto-block)

**Pasos:**
1. Mismo día. Confirmá que el slot **11:00–12:00** sigue verde dashed.
2. Click "Book Lesson" → instructor Carlos, **mismo día a las 11:30**, duración 60 min, otro student (o el mismo si tiene créditos).
3. Confirmar.

**Esperado:**
- ✅ Lesson creado, sólido azul 11:30–12:30.
- ✅ El slot 11:00–12:00, antes verde dashed, ahora se ve **gris dashed "Blocked"** (porque tiene overlap con el lesson nuevo pero no es exacto).

### B3 — Doble booking del mismo instructor (regresión)

**Pasos:**
1. Click "Book Lesson" → instructor **Carlos**, mismo día a las **11:45**, 60 min.

**Esperado:**
- ✅ Aparece toast/alert rojo: *"Instructor already has a lesson at this time."*
- ✅ El lesson NO se crea.

---

# 🧪 Bloque C — Student book

> Logueate como **Student**. Andá a `/student/book`.

### C1 — Ver openings disponibles

**Pasos:**
1. Entrar al portal student.
2. Buscar el instructor **Carlos Martinez** en la lista.

**Esperado:**
- ✅ Aparecen las fechas próximas con los slots disponibles **agrupados por instructor → día → hora**.
- ✅ Los slots que ya están booked/blocked **NO** aparecen.

### C2 — Bookear un opening

**Pasos:**
1. Elegir un slot futuro disponible (ej. mañana 09:00).
2. Avanzar paso a paso → en **Step 4 "Pickup & Drop-off"**, los inputs vienen pre-llenos con la dirección del student. Si están vacíos, completar ambos.
3. Click "Book Lesson".

**Esperado:**
- ✅ Toast verde de confirmación.
- ✅ Volvés al dashboard del student y ese slot **ya no aparece** en `/student/book`.
- ✅ El contador de **lessons remaining** baja en 1.

### C3 — Bookear sin créditos

**Pasos:**
1. Como admin, llevar el `lessons_remaining` del student a 0 (ir a `/dashboard/students/[id]` y editar, o gastar todos los créditos).
2. Como student, intentar bookear cualquier slot.

**Esperado:**
- ✅ El booking se rechaza con mensaje *"No lessons remaining. Please purchase a package first."* o equivalente.

---

# 🧪 Bloque D — Cancel & release

> Logueate como **Admin**. Andá a `/dashboard/schedule`.

### D1 — Confirmación al cancelar (NUEVO)

**Pasos:**
1. Click sobre un lesson `scheduled` (sólido azul). Se abre el detail dialog.
2. Click en el botón **Cancel** (rojo, abajo a la derecha).

**Esperado:**
- ✅ **NO se cancela inmediatamente**. En lugar de eso, aparece un AlertDialog con:
  - Título: *"Cancel this lesson?"*
  - Descripción con la fecha y hora del lesson.
  - Dos botones: **"Keep Lesson"** y **"Yes, Cancel Lesson"** (rojo).
3. Click **"Keep Lesson"** → el AlertDialog se cierra y el lesson **NO se cancela**.

### D2 — Confirmar cancelación + release del blocked

**Pasos:**
1. Buscar un lesson que tenga un opening `Blocked` adyacente (ej. el del Test B2: lesson 11:30–12:30 con opening blocked 11:00–12:00).
2. Click sobre el lesson → Cancel → **"Yes, Cancel Lesson"**.

**Esperado:**
- ✅ El lesson 11:30–12:30 desaparece (o se ve tachado/gris según UI).
- ✅ El opening 11:00–12:00 que estaba **gris dashed "Blocked"** vuelve a **verde dashed "Open"** (refresca solo, si no, F5).

### D3 — Cancelar lesson de un opening linkeado

**Pasos:**
1. Bookear como admin/student un opening exacto (ej. 09:00). El opening pasa a `booked` (desaparece visualmente porque hay un lesson sólido encima).
2. Cancelar ese lesson desde `/dashboard/schedule`.

**Esperado:**
- ✅ El lesson desaparece.
- ✅ El slot 09:00 vuelve a aparecer como **verde dashed "Open"**.

---

# 🧪 Bloque E — Buffer en regenerator (NUEVO)

> Este bloque verifica que cuando hay un lesson booked, los openings adyacentes que violarían el buffer **no se publican**.

### Setup E

1. Como **Carlos** en `/instructor/availability` → Preferences → buffer **= 0** → Save.
2. Asegurate que tenga un template con slots cada hora 09:00, 10:00, 11:00 (60min) Mon–Fri. Si no tenés, creá uno (la validación buffer no se va a disparar porque buffer = 0).
3. Como admin en `/dashboard/schedule`, bookear free-form a Carlos un lesson **mañana 10:00–11:00**.

### E1 — Estado base con buffer = 0

**Pasos:**
1. Como student en `/student/book`, mirar los slots de Carlos para mañana.

**Esperado:**
- ✅ Aparecen slots a las **09:00 y 11:00** disponibles (porque buffer = 0, no hay restricción).

### E2 — Activar buffer = 15 min y regenerar

**Pasos:**
1. Como Carlos, Preferences → buffer **= 15 min** → Save.
2. **Disparar regeneración**: tab Templates → ✏️ del template → toggle un día (ej. Sat ON), volvé a togglear (Sat OFF), Save.
3. Como student, refrescar `/student/book`.

**Esperado:**
- ✅ Los slots **09:00 y 11:00 de mañana ya NO aparecen** (porque están pegados al lesson 10:00–11:00 sin respetar el buffer de 15 min).
- ✅ Slots más alejados del lesson (ej. 12:00, 13:00 si el template los genera) **sí aparecen**.

### E3 — Volver buffer a 0 → vuelven los slots

**Pasos:**
1. Como Carlos, Preferences → buffer **= 0** → Save.
2. Trigger regen (toggle un día en cualquier template, Save).
3. Refrescar `/student/book`.

**Esperado:**
- ✅ Los slots 09:00 y 11:00 vuelven a aparecer.

---

# 🧪 Bloque F — Calendar rendering (admin)

> Logueate como **Admin**. Andá a `/dashboard/schedule`.

### F1 — Openings se ven en el calendar

**Esperado:**
- ✅ Los openings `available` se ven con **borde verde dashed** y leyenda "Open" o similar.
- ✅ Los openings `booked` NO aparecen visualmente (están tapados por el lesson sólido encima).
- ✅ Los openings `blocked` se ven con **borde gris dashed** "Blocked".

### F2 — Click en opening NO abre dialog

**Pasos:**
1. Click sobre un opening verde dashed.

**Esperado:**
- ✅ NO se abre ningún dialog (los openings tienen `pointer-events: none`; el click solo dispara si caés sobre un lesson sólido).

### F3 — Cambiar de semana mantiene los openings

**Pasos:**
1. Apretar las flechas para cambiar de semana o día.

**Esperado:**
- ✅ Los openings del nuevo rango se cargan automáticamente.

---

# 🛠️ Helpers — Reset entre tests

Como no usamos SQL, los resets son por UI. Los más útiles:

**Cancelar todos los lessons de testing:**
- Admin → `/dashboard/schedule` → click en cada lesson de testing → Cancel → Confirmar.

**Eliminar todos los templates de un instructor:**
- Logueado como ese instructor → `/instructor/availability` → Templates → 🗑️ en cada uno.

**Devolver buffer a 0:**
- Instructor → `/instructor/availability` → Preferences → 0 min → Save.

**Restaurar lessons remaining del student:**
- Admin → `/dashboard/students/[id]` → editar manualmente o usar el flujo de paquetes.

**Forzar regeneración de openings:**
- Como instructor → `/instructor/availability` → Templates → editar cualquier template, hacer un cambio mínimo (toggle un día y undo), Save. Esto dispara `regenerateOpenings()`.

---

# 📋 Checklist final

Después de correr todos los bloques:

- [ ] A1 – Crear template OK
- [ ] A2 – Validación duplicados OK
- [ ] A3 – Validación buffer OK
- [ ] A4 – Days off OK
- [ ] A5 – Delete template OK
- [ ] B1 – Auto-link booking OK
- [ ] B2 – Auto-block partial overlap OK
- [ ] B3 – Doble booking 409 OK
- [ ] C1 – Student ve openings OK
- [ ] C2 – Student bookea OK
- [ ] C3 – Student sin créditos bloqueado OK
- [ ] D1 – Confirmación cancel OK
- [ ] D2 – Cancel libera blocked OK
- [ ] D3 – Cancel libera booked → available OK
- [ ] E1 – Buffer 0, slots adyacentes visibles OK
- [ ] E2 – Buffer 15, slots adyacentes desaparecen OK
- [ ] E3 – Buffer 0 vuelve a publicar slots OK
- [ ] F1 – Openings se ven en admin calendar OK
- [ ] F2 – Click opening no abre dialog OK
- [ ] F3 – Cambio de semana carga openings OK

---

# Crear users de testing (si no los tenés)

Si la primera vez que usás esta guía no tenés cuentas dedicadas, hacelo así:

1. **Admin**: ya existe (es vos). Si necesitás otro, registrate desde `/register` con un email de testing y luego cambiá el role del user a `admin` desde Supabase (única vez que necesitás SQL — pedile a tu dev).

2. **Instructor (Carlos Martinez)**: como admin → `/dashboard/instructors` → "Add Instructor" → completá nombre `Carlos Martinez`, email de testing, modalidad `school`, hourly rate cualquiera. Se le manda un invite por email; el instructor abre el link y setea su password.

3. **Student**: como admin → `/dashboard/students` → "Add Student" → completá los datos requeridos (nombre, email, fecha de nacimiento, teléfono de un parent, etc.). Mismo flujo de invite.

4. **Darle créditos al student**: `/dashboard/students/[id]` → editar manualmente el campo `lessons_remaining` o registrá un payment manual.

---

_Guía generada 2026-05-01 — cubre Step 13 (Templates, Schedule, Openings, Buffer) + Cancel confirmation + Template buffer/duplicate validation + Regenerator buffer fix._
