// Seed script — populates the database with realistic demo data.
// Run: npx tsx scripts/seed.ts
//
// Creates auth users via admin API, then inserts rows into public tables.
// Idempotent-ish: if the admin email already exists the script fetches their
// school_id and skips school/admin creation.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Helpers ───────────────────────────────────────────────────────
function uuid() {
  return crypto.randomUUID()
}

/** Returns a date string offset from today */
function daysFromNow(n: number) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

function dateOnly(offsetDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

/** Returns an ISO datetime at a given hour (local-ish, UTC) */
function atHour(offsetDays: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

// ── Config ────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'admin@mydrive.com'
const ADMIN_PASSWORD = 'Lemat4444'
const SCHOOL_NAME = 'My Drive Academy'

const INSTRUCTORS = [
  { email: 'carlos.martinez@helixdriving.com', password: 'Lemat4444', first: 'Carlos', last: 'Martinez', phone: '+1 312 555 0101', license: 'IL-DI-44821', modality: 'school' as const, hourly: 3500, commission: 0.10, maxPerDay: 8 },
  { email: 'maria.gonzalez@helixdriving.com', password: 'Lemat4444', first: 'Maria', last: 'Gonzalez', phone: '+1 312 555 0102', license: 'IL-DI-55932', modality: 'school' as const, hourly: 3200, commission: 0.10, maxPerDay: 6 },
  { email: 'james.wilson@helixdriving.com', password: 'Lemat4444', first: 'James', last: 'Wilson', phone: '+1 312 555 0103', license: 'IL-DI-67043', modality: 'independent' as const, hourly: 0, commission: 0.10, maxPerDay: 7, lessonPrice: 7500 },
]

const STUDENTS = [
  { email: 'sofia.ramirez@gmail.com', password: 'Lemat4444', first: 'Sofia', last: 'Ramirez', phone: '+1 312 555 0201', dob: '2007-03-15' },
  { email: 'liam.chen@gmail.com', password: 'Lemat4444', first: 'Liam', last: 'Chen', phone: '+1 312 555 0202', dob: '2006-11-22' },
  { email: 'emma.johnson@gmail.com', password: 'Lemat4444', first: 'Emma', last: 'Johnson', phone: '+1 312 555 0203', dob: '2007-06-08' },
  { email: 'noah.williams@gmail.com', password: 'Lemat4444', first: 'Noah', last: 'Williams', phone: '+1 312 555 0204', dob: '2005-09-30' },
  { email: 'olivia.brown@gmail.com', password: 'Lemat4444', first: 'Olivia', last: 'Brown', phone: '+1 312 555 0205', dob: '2006-01-17' },
  { email: 'ethan.davis@gmail.com', password: 'Lemat4444', first: 'Ethan', last: 'Davis', phone: '+1 312 555 0206', dob: '2007-08-04' },
  { email: 'ava.garcia@gmail.com', password: 'Lemat4444', first: 'Ava', last: 'Garcia', phone: '+1 312 555 0207', dob: '2006-04-25' },
  { email: 'mason.lee@gmail.com', password: 'Lemat4444', first: 'Mason', last: 'Lee', phone: '+1 312 555 0208', dob: '2005-12-11' },
]

const VEHICLES = [
  { make: 'Toyota', model: 'Corolla', year: 2023, plate: 'IL-DRV-101' },
  { make: 'Honda', model: 'Civic', year: 2024, plate: 'IL-DRV-202' },
]

const PACKAGES = [
  { name: 'Single Lesson', description: 'One 60-minute driving lesson', lessons: 1, price: 6500 },
  { name: '5-Lesson Bundle', description: 'Five lessons at a discounted rate', lessons: 5, price: 29900 },
  { name: '10-Lesson Package', description: 'Ten lessons — best value', lessons: 10, price: 54900 },
]

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('Starting seed...\n')

  // ─── 1. School + Admin ─────────────────────────────────────────
  let schoolId: string
  let adminUserId: string

  // Check if school already exists by name
  const { data: existingSchool } = await admin.from('schools').select('id').eq('name', SCHOOL_NAME).single()

  if (existingSchool) {
    schoolId = existingSchool.id
    console.log(`School "${SCHOOL_NAME}" already exists (${schoolId}).`)

    // Find existing admin for this school
    const { data: existingAdmin } = await admin.from('users').select('id').eq('school_id', schoolId).eq('role', 'admin').single()
    adminUserId = existingAdmin?.id ?? ''
  } else {
    // Create admin auth user — the DB trigger auto-creates the school + users row
    const { data: adminAuth, error: adminAuthErr } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { school_name: SCHOOL_NAME },
    })
    if (adminAuthErr) throw new Error(`Admin auth: ${adminAuthErr.message}`)
    adminUserId = adminAuth.user.id

    // Wait for trigger to complete
    await new Promise((r) => setTimeout(r, 1000))

    const { data: adminProfile } = await admin.from('users').select('school_id').eq('id', adminUserId).single()
    if (!adminProfile) throw new Error('Could not find admin profile after trigger')
    schoolId = adminProfile.school_id

    console.log(`Admin created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  }

  // Ensure school settings are populated
  await admin.from('schools').update({
    email: 'info@mydriveacademy.com',
    phone: '+1 312 555 0001',
    address: '4500 N. Lincoln Ave, Chicago, IL 60625',
    single_lesson_price_cents: 6500,
    student_cancellation_fee_cents: 6000,
    instructor_cancellation_fee_cents: 3000,
    max_booking_days_ahead: 30,
  }).eq('id', schoolId)

  // ─── 2. Instructors ────────────────────────────────────────────
  const instructorIds: string[] = []

  for (const inst of INSTRUCTORS) {
    // Check if already exists
    const { data: existing } = await admin.from('users').select('id').eq('email', inst.email).single()
    if (existing) {
      const { data: instRow } = await admin.from('instructors').select('id').eq('user_id', existing.id).single()
      if (instRow) instructorIds.push(instRow.id)
      console.log(`Instructor ${inst.first} ${inst.last} already exists, skipping.`)
      continue
    }

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: inst.email,
      password: inst.password,
      email_confirm: true,
    })
    if (authErr) { console.error(`Instructor auth ${inst.email}: ${authErr.message}`); continue }

    const userId = authData.user.id
    await admin.from('users').insert({
      id: userId,
      school_id: schoolId,
      role: 'instructor',
      first_name: inst.first,
      last_name: inst.last,
      email: inst.email,
      phone: inst.phone,
    })

    const instructorId = uuid()
    await admin.from('instructors').insert({
      id: instructorId,
      user_id: userId,
      school_id: schoolId,
      license_number: inst.license,
      max_lessons_per_day: inst.maxPerDay,
      modality: inst.modality,
      commission_rate: inst.commission,
      hourly_rate_cents: inst.hourly,
      lesson_price_cents: inst.modality === 'independent' ? (inst as any).lessonPrice : null,
      uses_school_vehicle: false,
      vehicle_monthly_fee_cents: 0,
    })
    instructorIds.push(instructorId)

    // Availability: Mon-Fri 8am-5pm, Sat 9am-1pm
    const slots = [
      { day: 1, start: '08:00', end: '17:00' },
      { day: 2, start: '08:00', end: '17:00' },
      { day: 3, start: '08:00', end: '17:00' },
      { day: 4, start: '08:00', end: '17:00' },
      { day: 5, start: '08:00', end: '17:00' },
      { day: 6, start: '09:00', end: '13:00' },
    ]
    await admin.from('availability').insert(
      slots.map((s) => ({
        instructor_id: instructorId,
        day_of_week: s.day,
        start_time: s.start,
        end_time: s.end,
      }))
    )

    console.log(`Instructor created: ${inst.first} ${inst.last} (${inst.email} / ${inst.password})`)
  }

  // ─── 3. Students ───────────────────────────────────────────────
  const studentIds: string[] = []

  for (const stu of STUDENTS) {
    const { data: existing } = await admin.from('users').select('id').eq('email', stu.email).single()
    if (existing) {
      const { data: stuRow } = await admin.from('students').select('id').eq('user_id', existing.id).single()
      if (stuRow) studentIds.push(stuRow.id)
      console.log(`Student ${stu.first} ${stu.last} already exists, skipping.`)
      continue
    }

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: stu.email,
      password: stu.password,
      email_confirm: true,
    })
    if (authErr) { console.error(`Student auth ${stu.email}: ${authErr.message}`); continue }

    const userId = authData.user.id
    await admin.from('users').insert({
      id: userId,
      school_id: schoolId,
      role: 'student',
      first_name: stu.first,
      last_name: stu.last,
      email: stu.email,
      phone: stu.phone,
      date_of_birth: stu.dob,
    })

    const studentId = uuid()
    const lessonsCompleted = Math.floor(Math.random() * 8)
    const lessonsPurchased = lessonsCompleted + Math.floor(Math.random() * 5) + 1
    await admin.from('students').insert({
      id: studentId,
      user_id: userId,
      school_id: schoolId,
      enrollment_date: dateOnly(-Math.floor(Math.random() * 60 + 14)),
      status: 'active',
      total_lessons_purchased: lessonsPurchased,
      total_lessons_completed: lessonsCompleted,
      lessons_remaining: lessonsPurchased - lessonsCompleted,
      notes: null,
    })
    studentIds.push(studentId)
    console.log(`Student created: ${stu.first} ${stu.last} (${stu.email} / ${stu.password})`)
  }

  // ─── 4. Vehicles ───────────────────────────────────────────────
  const vehicleIds: string[] = []
  for (const v of VEHICLES) {
    const { data: existing } = await admin.from('vehicles').select('id').eq('license_plate', v.plate).single()
    if (existing) {
      vehicleIds.push(existing.id)
      console.log(`Vehicle ${v.plate} already exists, skipping.`)
      continue
    }
    const vid = uuid()
    await admin.from('vehicles').insert({
      id: vid,
      school_id: schoolId,
      make: v.make,
      model: v.model,
      year: v.year,
      license_plate: v.plate,
      is_active: true,
    })
    vehicleIds.push(vid)
    console.log(`Vehicle created: ${v.year} ${v.make} ${v.model} (${v.plate})`)
  }

  // ─── 5. Packages ───────────────────────────────────────────────
  const packageIds: string[] = []
  for (const p of PACKAGES) {
    const { data: existing } = await admin.from('packages').select('id').eq('name', p.name).eq('school_id', schoolId).single()
    if (existing) {
      packageIds.push(existing.id)
      console.log(`Package "${p.name}" already exists, skipping.`)
      continue
    }
    const pid = uuid()
    await admin.from('packages').insert({
      id: pid,
      school_id: schoolId,
      name: p.name,
      description: p.description,
      lesson_count: p.lessons,
      price_cents: p.price,
      is_active: true,
    })
    packageIds.push(pid)
    console.log(`Package created: ${p.name} ($${(p.price / 100).toFixed(2)})`)
  }

  // ─── 6. Lessons (past + future) ───────────────────────────────
  if (instructorIds.length === 0 || studentIds.length === 0) {
    console.log('\nNo instructors or students to create lessons for. Done.')
    return
  }

  // Check if lessons already exist
  const { count: lessonCount } = await admin.from('lessons').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
  if (lessonCount && lessonCount > 5) {
    console.log(`\n${lessonCount} lessons already exist, skipping lesson creation.`)
  } else {
    console.log('\nCreating lessons...')

    const lessonRows: any[] = []

    // Past completed lessons (last 30 days)
    for (let dayOffset = -30; dayOffset < 0; dayOffset++) {
      const date = new Date()
      date.setDate(date.getDate() + dayOffset)
      if (date.getDay() === 0) continue // skip Sundays

      const lessonsThisDay = Math.floor(Math.random() * 4) + 2 // 2-5 lessons per day
      for (let i = 0; i < lessonsThisDay; i++) {
        const hour = 8 + Math.floor(Math.random() * 9) // 8am-4pm
        const instIdx = Math.floor(Math.random() * instructorIds.length)
        const stuIdx = Math.floor(Math.random() * studentIds.length)
        const vehicleIdx = Math.floor(Math.random() * vehicleIds.length)
        const status = Math.random() < 0.85 ? 'completed' : (Math.random() < 0.5 ? 'cancelled' : 'no_show')

        const priceCents = 6500
        const earnCents = status === 'completed' ? 3500 : 0

        lessonRows.push({
          id: uuid(),
          school_id: schoolId,
          student_id: studentIds[stuIdx],
          instructor_id: instructorIds[instIdx],
          vehicle_id: vehicleIds[vehicleIdx],
          scheduled_at: atHour(dayOffset, hour),
          duration_minutes: 60,
          status,
          sold_by: 'school',
          price_cents: priceCents,
          instructor_earning_cents: earnCents,
          cancelled_by: status === 'cancelled' ? ['student', 'instructor', 'admin'][Math.floor(Math.random() * 3)] : null,
          cancellation_fee_cents: status === 'cancelled' ? (Math.random() < 0.5 ? 6000 : 3000) : 0,
          notes: null,
        })
      }
    }

    // Future scheduled lessons (next 14 days)
    for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
      const date = new Date()
      date.setDate(date.getDate() + dayOffset)
      if (date.getDay() === 0) continue

      const lessonsThisDay = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < lessonsThisDay; i++) {
        const hour = 8 + Math.floor(Math.random() * 9)
        const instIdx = Math.floor(Math.random() * instructorIds.length)
        const stuIdx = Math.floor(Math.random() * studentIds.length)
        const vehicleIdx = Math.floor(Math.random() * vehicleIds.length)

        lessonRows.push({
          id: uuid(),
          school_id: schoolId,
          student_id: studentIds[stuIdx],
          instructor_id: instructorIds[instIdx],
          vehicle_id: vehicleIds[vehicleIdx],
          scheduled_at: atHour(dayOffset, hour),
          duration_minutes: 60,
          status: 'scheduled',
          sold_by: 'school',
          price_cents: 6500,
          instructor_earning_cents: 0,
        })
      }
    }

    // Insert in batches of 50
    for (let i = 0; i < lessonRows.length; i += 50) {
      const batch = lessonRows.slice(i, i + 50)
      const { error } = await admin.from('lessons').insert(batch)
      if (error) console.error(`Lesson batch error: ${error.message}`)
    }
    console.log(`Created ${lessonRows.length} lessons (past + future)`)
  }

  // ─── 7. Payments ───────────────────────────────────────────────
  const { count: paymentCount } = await admin.from('payments').select('id', { count: 'exact', head: true }).eq('school_id', schoolId)
  if (paymentCount && paymentCount > 0) {
    console.log(`${paymentCount} payments already exist, skipping.`)
  } else {
    console.log('Creating payments...')
    const paymentRows: any[] = []

    for (let i = 0; i < studentIds.length; i++) {
      // Each student has 1-2 payments
      const numPayments = Math.floor(Math.random() * 2) + 1
      for (let j = 0; j < numPayments; j++) {
        const pkgIdx = Math.floor(Math.random() * packageIds.length)
        const pkg = PACKAGES[pkgIdx]
        paymentRows.push({
          id: uuid(),
          school_id: schoolId,
          student_id: studentIds[i],
          package_id: packageIds[pkgIdx],
          stripe_payment_intent_id: `pi_demo_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
          amount_cents: pkg.price,
          status: 'completed',
          created_at: daysFromNow(-Math.floor(Math.random() * 45 + 5)),
        })
      }
    }

    const { error } = await admin.from('payments').insert(paymentRows)
    if (error) console.error(`Payments error: ${error.message}`)
    else console.log(`Created ${paymentRows.length} payments`)
  }

  // ─── Done ──────────────────────────────────────────────────────
  console.log('\n--- Seed complete! ---')
  console.log('\nLogin credentials (all passwords: Lemat4444):')
  console.log(`  Admin:       ${ADMIN_EMAIL}`)
  INSTRUCTORS.forEach((i) => console.log(`  Instructor:  ${i.email}`))
  STUDENTS.forEach((s) => console.log(`  Student:     ${s.email}`))
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message)
  process.exit(1)
})
