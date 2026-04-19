# HelixDriving — Guía del Sistema

> Una plataforma web que le permite a una escuela de manejo gestionar todo su negocio desde un solo lugar: alumnos, instructores, horarios, pagos y reportes.

---

## 1. ¿Quiénes lo usan?

El sistema tiene **tres tipos de usuarios**, cada uno con su propio portal:

| Rol | Portal | Qué hace |
|-----|--------|----------|
| 🏫 **Administrador** | `/dashboard` | Dirige la escuela: alumnos, instructores, precios, reportes, cobros |
| 🚗 **Instructor** | `/instructor` | Ve su agenda, marca clases, gestiona su disponibilidad, consulta sus ganancias |
| 🎓 **Estudiante** | `/student` | Compra paquetes de clases, reserva lecciones, ve su historial |

---

## 2. Vista general del sistema

```
                    ┌───────────────────────────────────┐
                    │         HelixDriving              │
                    │   (aplicación web en la nube)     │
                    └───────────────────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
          ▼                         ▼                         ▼
   ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
   │ ADMIN       │           │ INSTRUCTOR  │           │ STUDENT     │
   │ (escuela)   │           │             │           │             │
   └─────────────┘           └─────────────┘           └─────────────┘
          │                         │                         │
          │ crea/edita              │ marca clases            │ compra / reserva
          │                         │                         │
          └────────────┬────────────┴────────────┬────────────┘
                       ▼                         ▼
              ┌─────────────────┐        ┌─────────────────┐
              │  Base de datos  │        │     Stripe      │
              │   (Supabase)    │        │ (procesamiento  │
              │                 │        │   de pagos)     │
              └─────────────────┘        └─────────────────┘
```

Cada escuela tiene sus **propios datos aislados** del resto (arquitectura multi-tenant).

---

## 3. Qué hace cada portal

### 🏫 Portal del Administrador

| Sección | Para qué sirve |
|---------|----------------|
| **Dashboard** | Vista rápida: alumnos activos, clases de la semana, ingresos |
| **Estudiantes** | Alta, edición, invitación por email, ver historial completo de cada uno |
| **Instructores** | Alta, configuración (tarifa, comisión, vehículo), disponibilidad |
| **Aplicaciones** | Recibir y aprobar postulaciones de nuevos instructores |
| **Agenda** | Calendario semanal con todas las clases — reservar, cancelar, reprogramar |
| **Vehículos** | Flota de la escuela |
| **Paquetes** | Armar ofertas de clases (ej. "10 clases por $500") |
| **Pagos** | Historial de cobros de Stripe |
| **Reportes** | Ingresos, progreso de alumnos, carga de instructores, **planilla de pagos** |
| **Ajustes** | Datos de la escuela, claves de Stripe, políticas de cancelación |

### 🚗 Portal del Instructor

| Sección | Para qué sirve |
|---------|----------------|
| **Dashboard** | Clases de hoy + próximas + total de clases completadas |
| **Agenda** | Calendario semanal con acciones rápidas: marcar como completa, no-show, cancelar |
| **Disponibilidad** | Configurar horarios semanales de trabajo + días libres puntuales (vacaciones, enfermedad) |
| **Ganancias** | Cálculo automático de lo ganado en el período, con deducciones |

### 🎓 Portal del Estudiante

| Sección | Para qué sirve |
|---------|----------------|
| **Dashboard** | Clases próximas, clases restantes, historial, foto del permiso |
| **Comprar Clases** | Ver paquetes disponibles y comprar con tarjeta (Stripe Checkout) |

---

## 4. Flujos clave del día a día

### 🆕 Nuevo estudiante se inscribe

```
  Estudiante recibe link con código de escuela
              │
              ▼
     Completa formulario público
  (datos personales + padres + permiso)
              │
              ▼
  Sistema crea su cuenta automáticamente
              │
              ▼
     Inicia sesión → Portal del Estudiante
```

**Dato importante:** Es **obligatorio** cargar el número de teléfono de al menos un padre/tutor.

---

### 💳 Estudiante compra un paquete de clases

```
  Estudiante entra a "Comprar Clases"
              │
              ▼
       Elige paquete o clase individual
              │
              ▼
  Se redirige a Stripe (pago con tarjeta)
              │
              ▼
        Pago exitoso → Stripe avisa
              │
              ▼
    Sistema acredita las clases a su cuenta
```

**Seguridad:** el sistema nunca ve los datos de la tarjeta (los maneja Stripe). Si Stripe reintenta la confirmación (cosa normal), el sistema detecta el duplicado y **no acredita doble**.

---

### 📅 Reserva de una clase

```
  Admin/Instructor/Estudiante abre el calendario
              │
              ▼
      Selecciona alumno + instructor + hora
              │
              ▼
  Sistema verifica en tiempo real:
    ✓ El instructor no tiene otra clase
    ✓ El alumno no tiene otra clase
    ✓ Hay clases disponibles en la cuenta
    ✓ Está dentro del plazo permitido
              │
              ▼
            Clase reservada
```

**Garantía a nivel de base de datos:** es físicamente imposible reservar dos clases que se solapen para el mismo instructor o alumno.

---

### ✅ Completar una clase

```
  Llega el día de la clase
              │
              ▼
    Instructor abre su agenda
              │
              ▼
  Marca la clase como "Completada"
              │
              ▼
  Sistema calcula automáticamente:
    ✓ Descontar 1 clase al alumno
    ✓ Sumar las ganancias del instructor
      (según modalidad: hourly o por comisión)
```

---

### 📋 Instructor nuevo aplica

```
  Instructor entra al link público de aplicaciones
              │
              ▼
  Completa formulario + sube documentos
  (licencia, seguro, antecedentes, etc.)
              │
              ▼
  Admin ve la aplicación en "Aplicaciones"
              │
              ▼
   Revisa documentos y aprueba o rechaza
              │
              ▼
  Si aprueba → instructor recibe invitación por email
```

---

## 5. Modalidades de Instructor

Hay dos tipos, cada uno con su estructura de pagos:

| Modalidad | Cómo funciona |
|-----------|---------------|
| **School (por hora)** | La escuela vende las clases. El instructor cobra una tarifa horaria fija. |
| **Independiente (comisión)** | El instructor trae sus propios alumnos. La escuela le cobra 10% de comisión + una cuota mensual fija por uso del vehículo ($272 por defecto). |

En ambos casos el vehículo siempre es del instructor (no de la escuela).

---

## 6. Pagos

- Cada escuela conecta **su propia cuenta de Stripe** (el dinero va directo a ella)
- HelixDriving **no toma comisión** ni se mete en el medio financieramente
- Los alumnos pagan con tarjeta en una página segura de Stripe (el sistema nunca ve los datos)
- Se generan comprobantes automáticamente
- Los webhooks de Stripe son **idempotentes** → un reintento no duplica clases ni cobros

---

## 7. Seguridad y confiabilidad

En lenguaje simple, esto es lo que está protegido:

| Qué | Cómo |
|-----|------|
| **Datos entre escuelas** | Cada escuela solo ve sus propios alumnos, instructores, pagos — físicamente imposible ver datos de otra escuela |
| **Claves de Stripe** | Solo el admin las puede leer — ni alumnos ni instructores pueden verlas |
| **Foto del permiso de conducir** | Almacenamiento privado, se comparte con links temporales (1 hora) — no es accesible públicamente |
| **Doble cobro por error de Stripe** | Imposible — la base de datos rechaza el duplicado |
| **Doble reserva** | Imposible — la base de datos rechaza el solapamiento |
| **Saldo negativo de clases** | Imposible — la base de datos lo rechaza |
| **Emails/licencias/patentes duplicadas** | Imposible — la base de datos garantiza unicidad |
| **Contraseñas** | Nunca se guardan en texto plano (Supabase Auth las cifra) |

---

## 8. Integración con Google Maps

Se va a integrar para:
- Autocompletar direcciones en formularios
- Mostrar el área de servicio de cada instructor
- Calcular distancias/rutas en la reserva

**Estado actual:** pendiente de activar la API (el dueño de la escuela se encarga); restringida a Illinois.

---

## 9. Información técnica (apéndice)

Para quien quiera el detalle bajo el capó:

- **Frontend:** Next.js 16 (React) + Tailwind CSS — se ve bien en celular y escritorio
- **Backend/DB:** Supabase (PostgreSQL) — base de datos con seguridad por fila
- **Pagos:** Stripe Checkout — certificado PCI compliant
- **Hosting:** Vercel — infraestructura en la nube, escalable automáticamente
- **Autenticación:** Supabase Auth — email/password + emails de recuperación
- **Almacenamiento:** Supabase Storage — fotos del permiso, documentos de instructores

Todo el sistema está construido con **TypeScript en modo estricto** — el código detecta errores antes de que lleguen a producción.

---

## 10. Estado del proyecto

### ✅ Completado
- Todos los portales y funciones core (12 pasos completos)
- 20 migraciones de base de datos aplicadas
- Hardening de seguridad completo
- Sistema de pagos + webhooks idempotentes
- Sistema de aplicaciones de instructor
- Sistema de ganancias + planilla de pagos

### 🔜 Próximos pasos (pre-lanzamiento)
- README + documentación interna
- Logo + favicon
- Templates de emails (bienvenida, confirmaciones)
- Rate limiting (protección contra abuso en formularios públicos)
- Deploy a Vercel (producción)
- Activación de Google Maps

---

*Última actualización: 18 de abril 2026*
