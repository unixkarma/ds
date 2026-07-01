---
name: il-sos-compliance
description: Illinois Secretary of State (SOS) driving-school regulatory reference for building/reviewing HelixDriving compliance features. Use when working on anything that must satisfy Illinois law — teen driver ed & GDL rules, adult driver education (18-20), required hours (30 classroom / 6 BTW / 6 observation), age_group / program_type logic, certificate & electronic completion reporting to the SOS, permit/GDL milestone tracking, instructor & school licensing data, training-vehicle records, or record-retention. Invoke when a feature, migration, report, or bug touches Illinois compliance, or when the user asks "what does Illinois require for X".
---

# il-sos-compliance — Illinois SOS driving-school compliance reference

You are working on **HelixDriving**, a driving-school SaaS whose first client is a school in **Chicago, Illinois, USA**. This skill is the **product-compliance reference**: it maps Illinois Secretary of State (SOS) requirements to what the software must track, report, or enforce. Use it to build correct compliance features and to spot where the product falls short of the law.

## How to use this skill

1. **This is a reference, not an autopilot.** Read the relevant section, then check the current code — schema/fields drift, so the "maps to HelixDriving" notes are a *checklist to verify against the codebase at use-time*, not a guarantee of what exists.
2. **Respect the verification markers.** Numbers marked **[VERIFIED]** were confirmed against official sources (ilsos.gov / ISBE / 92 Ill. Adm. Code via Cornell LII). Numbers marked **[UNVERIFIED]** or **[CONFIRM]** were only found in snippets/secondary sources — **never hard-code a fee, deadline, hour count, or reporting format that is flagged unverified without re-checking the live official page.** Regulatory numbers wrong in production create legal liability for the school.
3. **When the law is ambiguous or a spec is missing (e.g. the SOS electronic-reporting API), say so and point to the authoritative contact/URL — do not invent a scheme.**
4. **Cite the source** when you assert a requirement to the user, so they can verify.

## Three student tracks (this is the core mental model)

The single most important compliance axis is **age at first license**, which decides the required course. HelixDriving already models this via `students.age_group` ('teen' | 'adult') and `packages.program_type` ('teen' | 'adult' | 'both').

| Track | Ages | Course required | BTW required? | Source |
|---|---|---|---|---|
| **Teen** | 15–17 (under 18 at licensing) | Full teen driver ed: **30 hrs classroom + 6 hrs BTW + 6 hrs observation**; plus **50 hrs parent-supervised practice (incl. 10 night)**; full **GDL** restrictions apply | **Yes** | ISBE FAQ quoting 105 ILCS 5/27-24.2; 625 ILCS 5/6-107 |
| **Adult 18–20** | 18, 19, 20 (first license, no prior license & no HS classroom driver ed) | **6-hour Adult Driver Education course, classroom OR online only** | **No** — no BTW component mandated | 92 Ill. Adm. Code 1060.5 (def.); ilsos.gov ADE |
| **21+** | 21 and older | **None** (course only "suggested") | No | ilsos.gov ADE FAQ |

**Product implication:** only the **teen** track needs BTW hours, observation hours, parent-logged practice hours, and GDL milestone tracking. The adult 18–20 track is a fixed 6-hour classroom/online unit with SOS-issued certificate. 21+ needs no course record. `age_group` 'teen' vs 'adult' does NOT capture the 18–20 vs 21+ split by itself — if adult-ed compliance matters, the exact age/DOB drives whether the 6-hour course is mandatory.

## Teen driver ed & GDL — trackable numbers  [all VERIFIED unless flagged]

Course hours (statutory minimums):
- **Classroom: 30 clock hours** minimum.
- **Behind-the-wheel (BTW): 6 clock hours** minimum, dual-control car, public roads, certified instructor.
- **Observation: 6 hours** (≥1 hr per BTW hr, riding along during another student's BTW).
- **Parent-supervised practice: 50 hours total, including 10 at night**, with a licensed adult 21+ (licensed >1 yr). Logged by parent, not the school.
- Simulators/range **cannot** substitute for the 6 BTW hours (PA 95-0310).
- Note: HelixDriving tracks lessons as **counts/sessions** (`total_lessons_completed`, `classroom_sessions_attended`), not necessarily **clock hours**. Verify whether the product can prove "30 classroom hours / 6 BTW hours" — if it only counts sessions, that is a **compliance gap** for teen students.

GDL phases & milestones:
- **Instruction permit: min age 15**, must be enrolled in an approved driver-ed course; permit issued **≤30 days before** the course starts (92 Ill. Adm. Code 1030.1); requires **parent/guardian consent + vision + written test**.
- **Permit holding period: 9 months** minimum before the age-16 license. **[CONFIRM — snippet-level; long-standing but re-verify on live ilsos.gov GDL page]**
- **Driver's license: min age 16**, with parent verification of the 50/10 practice hours.
- **Night curfew (under 18): Sun–Thu 10pm–6am; Fri–Sat 11pm–6am** (exceptions: parent, work, school/religious activity, emergency).
- **Passenger limit:** first **12 months of licensing OR until age 18** (whichever first) — only **one passenger under 20** unless family (sibling/step/child).
- **Moving-violation penalty:** a conviction in the first 12 months **extends the passenger limit +6 months**.
- **Full licensing: age 18** after **6 months conviction-free**. **[CONFIRM — snippet-level]**
- **Cell phone: total ban** for permit/GDL holders **under 19** (emergencies excepted).

Teen eligibility to enroll: enrolled in high school and **passed ≥8 courses in the prior 2 semesters** (superintendent-waivable).

## Adult driver education (18–20) — trackable facts  [VERIFIED unless flagged]

- **6-hour course, classroom OR online**, ages 18–20, mandatory before first license if no prior license and no HS classroom driver ed. Online must enforce **≥360 minutes** timed (92 Ill. Adm. Code 1066.70).
- **Exemption:** proof of a completed HS driver-ed program (any state) waives it.
- **Completion window: within 30 days of start** (SOS-stated). **[CONFIRM — not in a primary code fetch]**
- **No BTW hours** mandated for this course.
- **Does NOT waive any SOS exam** — the applicant still takes vision + written + road test at a Driver Services facility. The provider's end-of-course exam (online: 20 questions, 75% pass) only proves completion. **Never advertise the course as waiving a test.**
- **Certificate is issued by the SOS, not the school.** The provider reports completion electronically; the SOS emails the student a link to download the SOS-issued certificate. **Product implication: store the SOS-emailed completion status; do NOT generate or number certificates yourself.**

## SOS electronic completion reporting — the core reporting rule

- **Teen (road-test administration path):** accredited schools/instructors certified to administer the road test report results electronically **by 11:59pm the same day** — student name, **instruction-permit number**, score sheet, date (92 Ill. Adm. Code 1060.82). Teen course-completion also flows school/HS → SOS upload; eligibility to test checked by **permit number** via ISBE's "Driver Education Student License Inquiry."
- **Adult 18–20:** provider must **electronically transmit to the SOS within 2 business days** of completion: **full name (first/middle/last), address, date of birth, gender, email** + the **statutory $5 per-student fee**. **[CONFIRM subsection — attributed to 92 Ill. Adm. Code 1060.72 in secondary sources; the "2 business days + $5" exact subsection was not fetched from a primary page]**
- **Transmission mechanism (API / file format): UNVERIFIED.** No public API/EDI/CSV/XML schema was found. Providers use an SOS portal. **Do not assume or invent an integration format — get the spec from the SOS Commercial Driver Training Section before building an automated feed.**
- **Certificate numbering: UNVERIFIED / not the school's job** — the SOS assigns identifiers. Don't invent a scheme.
- Data set for adult reporting does **not** clearly include a DL/permit number — don't assume it.

## School & instructor licensing (school-level compliance data)

Legal basis: 625 ILCS 5/6-401 et seq. + **92 Ill. Adm. Code Part 1060**. The school itself must hold an SOS Commercial Driver Training School (CDTS) license. Data the product may need to store/surface for the school:

- **License is annual**; renewal application **≥15 days before expiration**.
- **Surety bond, tiered by accreditation** (verify current Part 1060 before relying): non-accredited $10k; CDL **or** teen accredited $40k; CDL **and** teen $60k; 3+ branches variants $50k/$70k. **[CONFIRM — some figures dated "eff. 2011"]**
- **Insurance on instruction vehicles:** min **$50k/person bodily injury** (SOS restates $10k property / $50k one person / $100k two+); carrier certificate on file with SOS, cancellable only on **10 days' notice** to SOS.
- **Accreditations layered on the base license:** `teen` (required to train under-18, §§1060.180/181), `cdl` (§1060.200, parallels 49 CFR 383.110–121). Illinois does **not** use "Type A/B". Model as flags: `teen`, `cdl`, `branch_count` → drives bond tier.
- **Instructor licensing (625 ILCS 5/6-411; §1060.120):** ≥21, IL resident, valid license 2 yrs, good moral character, **fingerprint-based background check**, medically fit. Classroom-phase instructors need a **48-hour course** + 2 months' BTW-with-adults experience; instructors of under-18 need the mandatory 48-hr course (§§1060.180/181). Instructor license renews **annually**. Owner may not use unlicensed instructors. ISBE transmits a weekly instructor-license file to the SOS.
- **Fees:** exact statutory school/instructor license & renewal fees **[UNVERIFIED]**; instructor app fee reported as **$70 [PARTIALLY VERIFIED]**. Confirm on SOS forms / fee page before displaying.

## Training vehicles & record retention

- **Dual-control vehicle:** second instructor foot brake, right-side outside mirror, driver-ed identification sign. For CDL training, vehicle must match the instructor's licensed class.
- **IDOT safety inspection** required for every instruction vehicle; sticker with valid year; evidence with initial + each renewal + any newly purchased vehicle (§1060.110).
- **Insurance-certificate sticker** affixed to lower-right windshield.
- Product may track per vehicle: VIN, licensed class, IDOT inspection year/expiry, insurance validity + carrier cancellation-notice date, dual-control/marking compliance.
- **Record retention: keep each student's permanent instruction record ≥3 years after the road-test date** (625 ILCS 5/6-408; Part 1060), at the main office; then **securely shred**. Missing/incomplete records = prima facie evidence instruction wasn't given. SOS may **retest any student** if an audit flags improper testing. **Product implication: a per-student instruction log (classroom + BTW hours, dates, instructor, vehicle, road-test date) with a 3-year retention clock keyed to road-test date, exportable for audit.**

## Mapping to HelixDriving (verify against current code)

Fields that already exist (as of this writing) and what they cover:
- `students.age_group` ('teen'|'adult') + `packages.program_type` ('teen'|'adult'|'both') → the track split. **Gap to check:** does not distinguish 18–20 (course-required) from 21+ (no course) — that needs DOB/age logic.
- `students.classroom_sessions_attended`, `packages.classroom_required`, `student_purchases.classroom_required` → classroom **session count**. **Gap to check:** SOS requires **clock hours** (30 classroom / 6 BTW / 6 observation) — confirm whether sessions map to hours, else the product can't prove statutory hours.
- `students.total_lessons_completed` → BTW **lesson count**, not clock hours or the 6-hour minimum, and no observation-hour tracking.

Likely compliance gaps to raise when relevant (verify before asserting): GDL milestone tracking (permit issue date, 9-month holding, license/full-license eligibility, night/passenger restriction status), parent-logged 50/10 practice hours, SOS electronic completion reporting + $5 fee, SOS-issued certificate status storage, 3-year retention clock keyed to road-test date, instructor/vehicle credential + IDOT-inspection tracking.

## Verification caveats (carry these forward)

- Both `ilga.gov` and `ilsos.gov` block automated fetching; the research behind this skill used **ISBE FAQ (PDF, dated May 2017)**, live ilsos.gov content via search, and the **Cornell LII mirror** of 92 Ill. Adm. Code. Treat the official ilga.gov/ilsos.gov pages as the record of truth.
- **Re-verify before hard-coding:** all dollar fees, the 9-month permit hold, the "6 months conviction-free," the adult "2 business days + $5" subsection, bond-tier amounts, and any reporting API/file format.
- ISBE FAQ is from 2017; core hours (30/6/6, 50/10) and curfew still match 2026 ilsos.gov, but treat ancillary details as possibly dated.

## Key official sources

- ilsos.gov — GDL: https://www.ilsos.gov/departments/drivers/teen-driver-safety/gdl.html
- ilsos.gov — Instruction Permit: https://www.ilsos.gov/departments/drivers/driver-education/instructpermit.html
- ilsos.gov — Adult Driver Education + FAQ: https://www.ilsos.gov/departments/drivers/driver-education/ade.html · https://www.ilsos.gov/departments/drivers/driver-education/adefaq.html
- ilsos.gov — Commercial Driver Training Schools: https://www.ilsos.gov/departments/drivers/driver-education/commercial-driver-training/cdt.html
- ISBE — Driver Education FAQ (PDF): https://www.isbe.net/Documents/driver_ed_faq.pdf
- 92 Ill. Adm. Code Part 1060 (schools): https://www.ilga.gov/commission/jcar/admincode/092/09201060sections.html
- 92 Ill. Adm. Code Part 1066 (online adult ed): https://www.ilga.gov/commission/jcar/admincode/092/09201066sections.html
- Statutes: 625 ILCS 5/6-107, 6-107.1, 6-107.5, 6-401 to 6-415, 6-408.5, 12-610.1; 105 ILCS 5/27-24 et seq.
