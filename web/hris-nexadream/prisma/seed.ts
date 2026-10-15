// Seed idempoten: upsert data referensi dari katalog bersama.
// Data referensi untuk produksi WAJIB juga dikirim lewat migrasi (02 §5) — seed tidak ikut deploy.
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, type Prisma } from '../generated/prisma/client'
import { PERMISSION_KEYS, SYSTEM_ROLES, describePermission, permissionGroupOf } from '../shared/utils/permissions'
import { flattenMenuTree } from '../shared/utils/menus'
import { SETTINGS_CATALOG } from '../shared/utils/settings'
import { EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES } from '../shared/utils/templates'
import { SEED_PLANS } from '../shared/utils/plans'
import { PAYMENT_PROVIDERS } from '../shared/utils/payments'
import { DEFAULT_LEAVE_TYPES, DEFAULT_SALARY_COMPONENTS } from '../shared/utils/hr'
import { encrypt } from '../server/utils/crypto'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set.')
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

const isProduction = process.env.NODE_ENV === 'production' || process.env.NUXT_PUBLIC_APP_ENV === 'production'

/** Kata sandi akun demo/dev. Hanya untuk lingkungan lokal — ganti di produksi. */
const DEV_PASSWORD = 'Nexadream#2026'

async function seedPermissionsAndRoles() {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: { group: permissionGroupOf(key), description: describePermission(key) },
      create: { key, group: permissionGroupOf(key), description: describePermission(key) }
    })
  }
  const permissionRows = await prisma.permission.findMany({ select: { id: true, key: true } })
  const idByKey = new Map(permissionRows.map(p => [p.key, p.id]))

  for (const role of SYSTEM_ROLES) {
    const id = `role-${role.slug}`
    await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description, isSuperAdmin: role.isSuperAdmin, isSystem: true },
      create: { id, slug: role.slug, name: role.name, description: role.description, isSuperAdmin: role.isSuperAdmin, isSystem: true }
    })
    const saved = await prisma.role.findUniqueOrThrow({ where: { slug: role.slug } })
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: saved.id } }),
      prisma.rolePermission.createMany({
        data: role.keys()
          .map(key => idByKey.get(key))
          .filter((permissionId): permissionId is string => !!permissionId)
          .map(permissionId => ({ roleId: saved.id, permissionId }))
      })
    ])
  }
}

async function seedMenus() {
  // Orang tua lebih dulu (flattenMenuTree sudah berurutan pre-order).
  for (const row of flattenMenuTree()) {
    await prisma.menu.upsert({
      where: { slug: row.slug },
      update: {},
      create: row
    })
  }
}

async function seedSettings() {
  for (const def of SETTINGS_CATALOG) {
    await prisma.appSetting.upsert({
      where: { key: def.key },
      update: { group: def.group, type: def.type, label: def.label, isSecret: !!def.isSecret },
      // Nilai rahasia tidak di-seed (kosong); nilai biasa memakai default katalog.
      create: { key: def.key, value: def.isSecret ? null : def.default, group: def.group, type: def.type, label: def.label, isSecret: !!def.isSecret }
    })
  }
}

async function seedTemplates() {
  for (const t of EMAIL_TEMPLATES) {
    await prisma.emailTemplate.upsert({
      where: { key: t.key },
      update: {},
      create: {
        id: `email-${t.key}`,
        key: t.key,
        name: t.name,
        subject: t.subject,
        body: t.body,
        description: t.description,
        variables: t.variables as unknown as Prisma.InputJsonValue
      }
    })
  }
  for (const t of NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { key: t.key },
      update: {},
      create: {
        id: `notif-${t.key}`,
        key: t.key,
        name: t.name,
        title: t.title,
        body: t.body,
        actionLabel: t.actionLabel,
        actionUrl: t.actionUrl,
        icon: t.icon,
        level: t.level,
        variables: t.variables as unknown as Prisma.InputJsonValue
      }
    })
  }
}

async function seedPlans() {
  for (const plan of SEED_PLANS) {
    const data = {
      name: plan.name,
      description: plan.description,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      limits: plan.limits as unknown as Prisma.InputJsonValue,
      features: plan.features as unknown as Prisma.InputJsonValue,
      trialDays: plan.trialDays,
      order: plan.order
    }
    // Paket yang sudah ada TIDAK ditimpa: nilainya milik /admin/plans.
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {},
      create: { id: `plan-${plan.slug}`, slug: plan.slug, ...data }
    })
  }
}

async function seedGateways() {
  for (const provider of PAYMENT_PROVIDERS) {
    await prisma.paymentGateway.upsert({
      where: { provider: provider.value },
      update: { label: provider.label },
      create: {
        id: `gateway-${provider.value}`,
        provider: provider.value,
        label: provider.label,
        baseUrl: 'https://nexadream.id',
        orderPrefix: 'HRN',
        isActive: false,
        isSandbox: false
      }
    })
  }
}

async function seedSuperadmin() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL || 'admin@nexadream.id').toLowerCase()
  const password = process.env.SEED_SUPERADMIN_PASSWORD || (isProduction ? '' : DEV_PASSWORD)
  if (!password) throw new Error('SEED_SUPERADMIN_PASSWORD is required in production.')
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return
  await prisma.user.create({
    data: { name: 'Superadmin', email, passwordHash: await bcrypt.hash(password, 10), roleId: 'role-superadmin' }
  })
  console.info(`Superadmin created: ${email}`)
}

/** Perusahaan demo dengan empat login (owner, hr_admin, manager, employee). Hanya non-produksi. */
async function seedDemoTenant() {
  if (isProduction) return
  if (await prisma.tenant.findUnique({ where: { slug: 'demo-maju-bersama' } })) return

  const plan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'business' } })
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10)
  const now = new Date()

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: 'PT Maju Bersama (Demo)',
        slug: 'demo-maju-bersama',
        email: 'owner@demo.nexadream.id',
        phone: '6281100000001',
        timezone: 'Asia/Jakarta',
        dataConsentAcceptedAt: now,
        onboardingCompletedAt: now
      }
    })
    await tx.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'trialing', trialEndsAt: new Date(now.getTime() + 14 * 86400_000) }
    })
    await tx.subscriptionEvent.create({
      data: { tenantId: tenant.id, transition: 'signup', toStatus: 'trialing', toPlanSlug: plan.slug, period: 'monthly' }
    })
    await tx.branch.create({
      data: { tenantId: tenant.id, name: 'Kantor Pusat', code: 'DEMO01', timezone: 'Asia/Jakarta', isPrimary: true }
    })

    const people = [
      { role: 'owner', name: 'Sari Wijaya', email: 'owner@demo.nexadream.id', phone: '6281100000001' },
      { role: 'hr_admin', name: 'Dewi Lestari', email: 'hr@demo.nexadream.id', phone: '6281100000002' },
      { role: 'manager', name: 'Agus Pratama', email: 'manager@demo.nexadream.id', phone: '6281100000003' },
      { role: 'employee', name: 'Budi Santoso', email: 'employee@demo.nexadream.id', phone: '6281100000004' }
    ] as const

    for (const person of people) {
      const user = await tx.tenantUser.create({
        data: { name: person.name, email: person.email, phone: person.phone, passwordHash, emailVerifiedAt: now }
      })
      await tx.tenantMembership.create({ data: { tenantId: tenant.id, tenantUserId: user.id, role: person.role } })
    }
  })
  console.info('Demo tenant created: slug demo-maju-bersama (logins *@demo.nexadream.id, password = DEV_PASSWORD in prisma/seed.ts)')
}

/**
 * Data HR demo (fase 11): organisasi, 10 karyawan (4 terhubung ke login demo), gaji, absensi 10 hari kerja,
 * dan beberapa pengajuan. Idempoten: dilewati bila perusahaan demo sudah punya karyawan. Hanya non-produksi.
 */
async function seedDemoHr() {
  if (isProduction) return
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-maju-bersama' }, include: { branches: true, memberships: { include: { tenantUser: true } } } })
  if (!tenant || await prisma.employee.count({ where: { tenantId: tenant.id } })) return
  const tenantId = tenant.id
  const branch = tenant.branches.find(b => b.isPrimary) ?? tenant.branches[0]!
  const login = (role: string) => tenant.memberships.find(m => m.role === role)?.tenantUserId ?? null
  const hr = (v: string) => encrypt(v, 'hr')
  const d = (key: string) => new Date(`${key}T00:00:00.000Z`)

  const departments = Object.fromEntries(await Promise.all(['Direksi', 'Operasional', 'Keuangan', 'Penjualan', 'SDM'].map(async name =>
    [name, (await prisma.department.create({ data: { tenantId, name } })).id] as const)))
  const positions = Object.fromEntries(await Promise.all([['Direktur', 1], ['Manajer', 2], ['Supervisor', 3], ['Staf', 4]].map(async ([name, level]) =>
    [name, (await prisma.position.create({ data: { tenantId, name: String(name), level: Number(level) } })).id] as const)))
  const shift = await prisma.shift.create({ data: { tenantId, name: 'Jam kerja normal', code: 'NORMAL', startTime: '08:00', endTime: '17:00', breakMinutes: 60, lateToleranceMinutes: 5, workingDays: [1, 2, 3, 4, 5], isDefault: true } })
  const components = Object.fromEntries(await Promise.all(DEFAULT_SALARY_COMPONENTS.map(async (c, order) =>
    [c.code, (await prisma.salaryComponent.create({ data: { tenantId, ...c, order } })).id] as const)))
  await prisma.leaveType.createMany({ data: DEFAULT_LEAVE_TYPES.map((t, order) => ({ tenantId, ...t, order })) })

  const people = [
    { n: 'EMP-0001', name: 'Sari Wijaya', g: 'female', dep: 'Direksi', pos: 'Direktur', join: '2021-03-01', base: 25_000_000, ptkp: 'K2', user: login('owner') },
    { n: 'EMP-0002', name: 'Dewi Lestari', g: 'female', dep: 'SDM', pos: 'Manajer', join: '2022-01-10', base: 12_000_000, ptkp: 'K1', user: login('hr_admin'), manager: 'EMP-0001' },
    { n: 'EMP-0003', name: 'Agus Pratama', g: 'male', dep: 'Operasional', pos: 'Manajer', join: '2022-06-01', base: 13_500_000, ptkp: 'K0', user: login('manager'), manager: 'EMP-0001' },
    { n: 'EMP-0004', name: 'Budi Santoso', g: 'male', dep: 'Operasional', pos: 'Staf', join: '2023-04-17', base: 6_500_000, ptkp: 'TK0', user: login('employee'), manager: 'EMP-0003' },
    { n: 'EMP-0005', name: 'Rina Kartika', g: 'female', dep: 'Operasional', pos: 'Supervisor', join: '2023-09-04', base: 8_200_000, ptkp: 'K1', manager: 'EMP-0003' },
    { n: 'EMP-0006', name: 'Joko Susilo', g: 'male', dep: 'Operasional', pos: 'Staf', join: '2024-02-12', base: 5_600_000, ptkp: 'TK0', manager: 'EMP-0003', type: 'contract', contractEnd: '2026-11-11' },
    { n: 'EMP-0007', name: 'Putri Maharani', g: 'female', dep: 'Keuangan', pos: 'Supervisor', join: '2022-11-01', base: 9_000_000, ptkp: 'TK1', manager: 'EMP-0001' },
    { n: 'EMP-0008', name: 'Hendra Gunawan', g: 'male', dep: 'Penjualan', pos: 'Staf', join: '2024-07-01', base: 6_000_000, ptkp: 'K3', manager: 'EMP-0001' },
    { n: 'EMP-0009', name: 'Wulan Sari', g: 'female', dep: 'Keuangan', pos: 'Staf', join: '2025-01-06', base: 5_800_000, ptkp: 'TK0', manager: 'EMP-0007' },
    { n: 'EMP-0010', name: 'Fajar Nugroho', g: 'male', dep: 'Penjualan', pos: 'Staf', join: '2026-08-03', base: 5_400_000, ptkp: 'TK0', manager: 'EMP-0001', status: 'probation', probationEnd: '2026-11-03' }
  ] as const
  const ids = new Map<string, string>()
  for (const [i, p] of people.entries()) {
    const extra = p as { type?: 'contract', contractEnd?: string, status?: 'probation', probationEnd?: string, manager?: string, user?: string | null }
    const e = await prisma.employee.create({
      data: {
        tenantId, branchId: branch.id, employeeNumber: p.n, fullName: p.name, gender: p.g, ptkpStatus: p.ptkp,
        email: `${p.name.split(' ')[0]!.toLowerCase()}@demo.nexadream.id`, phone: `62812000000${String(i + 10)}`,
        joinDate: d(p.join), employmentType: extra.type ?? 'permanent', status: extra.status ?? 'active',
        contractEndDate: extra.contractEnd ? d(extra.contractEnd) : null, probationEndDate: extra.probationEnd ? d(extra.probationEnd) : null,
        departmentId: departments[p.dep], positionId: positions[p.pos], managerId: extra.manager ? ids.get(extra.manager) : null,
        shiftId: shift.id, tenantUserId: extra.user ?? null, birthDate: d(`19${85 + i}-0${(i % 9) + 1}-1${i % 9}`),
        nikEncrypted: hr(`317401${String(1200 + i).padStart(4, '0')}90${String(i + 1).padStart(4, '0')}`), npwpEncrypted: hr(`3174011${String(i).padStart(2, '0')}12900${String(i + 1).padStart(3, '0')}`.slice(0, 16)),
        bankName: 'BCA', bankAccountNumberEncrypted: hr(`52100${String(10000 + i * 137)}`), bankAccountName: p.name
      }
    })
    ids.set(p.n, e.id)
    await prisma.employmentHistory.create({ data: { tenantId, employeeId: e.id, effectiveFrom: d(p.join), branchId: branch.id, departmentId: departments[p.dep], positionId: positions[p.pos], managerId: e.managerId, employmentType: e.employmentType, status: e.status, branchName: branch.name, departmentName: p.dep, positionName: p.pos, note: 'Data demo' } })
    await prisma.employeeSalary.create({
      data: { tenantId, employeeId: e.id, effectiveFrom: d(p.join), dataEncrypted: hr(JSON.stringify({ baseSalary: p.base, items: [{ componentId: components.FIXED_ALLOWANCE, amount: Math.round(p.base * 0.1) }, { componentId: components.TRANSPORT, amount: 500_000 }, { componentId: components.MEAL, amount: 440_000 }] })) }
    })
  }

  // Absensi 10 hari kerja terakhir (WIB, UTC+7) untuk karyawan yang sudah bergabung.
  const days: string[] = []
  for (let cursor = new Date(Date.now() - 86400_000); days.length < 10; cursor = new Date(cursor.getTime() - 86400_000)) {
    const key = new Date(cursor.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
    const wd = new Date(`${key}T00:00:00Z`).getUTCDay()
    if (wd >= 1 && wd <= 5) days.push(key)
  }
  const at = (key: string, hh: number, mm: number) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)), hh - 7, mm))
  for (const [i, p] of people.entries()) {
    for (const [j, key] of days.entries()) {
      if (key < p.join || (i === 5 && j === 3)) continue // satu hari alpa untuk Joko
      const late = (i + j) % 7 === 0 ? 17 : 0
      const inAt = at(key, 7, 50 + ((i * 3 + j) % 9) + late)
      const outAt = at(key, 17, 5 + ((i + j * 2) % 25))
      const lateMinutes = Math.max(0, Math.floor((inAt.getTime() - at(key, 8, 0).getTime()) / 60000))
      await prisma.attendanceRecord.create({ data: { tenantId, branchId: branch.id, employeeId: ids.get(p.n)!, workDate: d(key), shiftId: shift.id, scheduledStartAt: at(key, 8, 0), scheduledEndAt: at(key, 17, 0), clockInAt: inAt, clockOutAt: outAt, status: lateMinutes > 5 ? 'late' : 'present', lateMinutes: lateMinutes > 5 ? lateMinutes : 0, workedMinutes: Math.floor((outAt.getTime() - inAt.getTime()) / 60000) - 60, source: 'self' } })
    }
  }
  await prisma.holiday.createMany({ data: [['2026-01-01', 'Tahun Baru Masehi'], ['2026-05-01', 'Hari Buruh Internasional'], ['2026-06-01', 'Hari Lahir Pancasila'], ['2026-08-17', 'Hari Kemerdekaan RI'], ['2026-12-25', 'Hari Raya Natal']].map(([date, name]) => ({ tenantId, date: d(date!), name: name! })) })
  console.info('Demo HR data created: 10 employees, salaries, attendance (last 10 workdays).')
}

async function main() {
  await seedPermissionsAndRoles()
  await seedMenus()
  await seedSettings()
  await seedTemplates()
  await seedPlans()
  await seedGateways()
  // Halaman CMS & FAQ awal dikirim lewat migrasi fase 9 (20261019000000_phase9_public_site).
  await seedSuperadmin()
  await seedDemoTenant()
  await seedDemoHr()
  console.info('Seed complete.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
