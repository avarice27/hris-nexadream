# 02 — Database Schema

The complete Prisma schema of the **platform layer** of HRIS Nexadream. The
HRIS domain tables (Employee, Department, ...) are added beside it (see
`18-domain-layer-guide.md`). Decisions: `../tasks/DECISIONS.md`.

## 1. Conventions (MUST)

- Every model maps to a `snake_case` table via `@@map`; fields stay `camelCase`.
- Ids are `cuid()`, **except seeded reference rows**, which use deterministic
  string ids (`menu-{slug}`, `plan-free`, `role-superadmin`,
  `gateway-nexadream-hub`) so re-seeds and migrations stay idempotent.
- `createdAt` / `updatedAt` on every edited table.
- Timestamps are stored UTC; conversion to a local clock happens at the edges
  (UI formatting, report SQL).
- **Every tenant-owned row carries `tenantId`**, even when it also has a
  `branchId` that implies it.
- Index every foreign key plus `tenantId`, `branchId` and anything filtered or
  sorted on. Compound `@@index([tenantId, createdAt])` on high-volume tables.
- `onDelete: Cascade` only where a row is meaningless without its parent
  (role → role_permissions, user → password_resets). **Tenant deletion is a
  soft delete** (`deletedAt`) plus an explicit purge job — never a cascade.
- Money: `Decimal(14,2)` in the DB, plain number over the wire, converted in
  exactly one helper module. **Gateway amounts are `Int` in the smallest
  currency unit.** Nothing is `Float`.
- Enum *values* are English slugs. Their display labels live in
  `shared/utils/status.ts`, never in the DB.

## 2. Entity overview

```
PLATFORM (back-office)                    TENANCY
User ─▶ Role ─▶ RolePermission ◀─ Permission     Tenant (= the customer Company = the account)
Menu (self-tree, /admin sidebar)            ├── Subscription ─▶ Plan
Invitation (staff invites)                  ├── SubscriptionEvent[] (append-only history)
                                            ├── Payment[]
AUTH SUPPORT                                ├── TenantMembership ─▶ TenantUser
PasswordReset (both audiences)              │      └── TenantMembershipBranch[] (empty = all)
AuthHandoff (OAuth → SPA)                   ├── TenantInvitation[]
TenantUserIdentity (OAuth links)            ├── Branch[] (optional multi-location)
                                            ├── ApiClient[] (integration keys)
BILLING                                     ├── TrialClaim (one trial per email)
Plan, PaymentGateway,                       ├── Notification[]
PaymentWebhookEvent                         └── AuditLog[]

MESSAGING                                   CONTENT & CONFIG
Notification, PushDevice,                   AppSetting (key/value), Page, Faq,
ScheduledNotification,                      ContactMessage
EmailTemplate, NotificationTemplate
                                            ANALYTICS
                                            UsageDaily (device-days, no PII)

HRIS DOMAIN (added later, all carry tenantId; see 18 — placeholders, not schemas)
Employee ── Department, Position, EmploymentHistory (effective-dated)
         ── EmployeeDocument, EmergencyContact / Family (sensitive)
         ── AttendanceRecord, Shift, ShiftAssignment
         ── LeaveType, LeaveBalance (ledger), LeaveRequest
         ── OvertimeRequest, Reimbursement
         ── SalaryComponent, EmployeeSalary (effective-dated), PayrollRun, Payslip
         ── PerformanceReview
ApprovalFlow / ApprovalStep (generic, used by leave/overtime/reimbursement)
```

**`Employee` <-> `TenantUser` link.** An `Employee` is HR data and may exist
**without** a login. `Employee.tenantUserId` is nullable and unique per tenant
(`@@unique([tenantId, tenantUserId])`). Inviting an employee to self-service
creates or links a `TenantUser` + `TenantMembership` with role `employee`
(D2/D3). Employees with role `employee` do not consume `teamMembers` seats; the
`employees` limit counts active `Employee` rows. Platform tables never import
domain tables: the link lives on the domain side only. Each `Employee` belongs
to a `branchId` (office) and its attendance days are cut on that branch's clock.

## 3. Full schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  // Prisma 7: no url here — prisma.config.ts (CLI) and the pg adapter (runtime).
}

// ---------------------------------------------------------------------------
// Platform RBAC (back-office staff — /admin)
// ---------------------------------------------------------------------------

model User {
  id           String    @id @default(cuid())
  name         String
  email        String    @unique
  phone        String?
  passwordHash String
  avatarUrl    String?
  isActive     Boolean   @default(true)
  lastLoginAt  DateTime?
  /// Last authenticated request; written at most once per 15 min per user.
  lastSeenAt   DateTime?
  roleId       String
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  role           Role            @relation(fields: [roleId], references: [id])
  passwordResets PasswordReset[]
  invitations    Invitation[]    @relation("InvitationInvitedBy")
  auditLogs      AuditLog[]
  notifications  Notification[]

  @@index([roleId])
  @@index([isActive])
  @@map("users")
}

model Role {
  id           String   @id @default(cuid())
  slug         String   @unique
  name         String
  description  String?
  isSuperAdmin Boolean  @default(false) // gates impersonation + destructive actions
  isSystem     Boolean  @default(false) // seeded; not deletable
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  users       User[]
  permissions RolePermission[]
  invitations Invitation[]

  @@map("roles")
}

model Permission {
  id          String   @id @default(cuid())
  key         String   @unique // dotted, English: 'tenants.write'
  group       String
  description String            // product language, shown in /admin/roles
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  roles RolePermission[]

  @@index([group])
  @@map("permissions")
}

model RolePermission {
  roleId       String
  permissionId String

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
  @@index([permissionId])
  @@map("role_permissions")
}

/// Self-referential sidebar tree for /admin. `parentId == null && path == null`
/// marks a section header. Max depth 3 (section → item → child item).
model Menu {
  id            String   @id            // deterministic: menu-{slug}
  parentId      String?
  label         String                  // product language — rendered
  slug          String   @unique        // English
  path          String?
  icon          String?
  permissionKey String?
  order         Int      @default(0)
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  parent   Menu?  @relation("MenuTree", fields: [parentId], references: [id], onDelete: Cascade)
  children Menu[] @relation("MenuTree")

  @@index([parentId])
  @@index([order])
  @@map("menus")
}

// ---------------------------------------------------------------------------
// Tenancy (the customer business — /app)
// ---------------------------------------------------------------------------

enum TenantStatus {
  active
  suspended
  deleted
}

model Tenant {
  id                    String       @id @default(cuid())
  name                  String
  slug                  String       @unique
  phone                 String?      // null until onboarding for OAuth signups
  email                 String?
  /// Display timezone for screens with no branch in scope.
  timezone              String       @default("Asia/Jakarta")
  logoUrl               String?
  status                TenantStatus @default(active)
  suspendedAt           DateTime?
  suspendedReason       String?
  /// Personal-data consent captured at signup/onboarding (UU PDP / GDPR-like).
  dataConsentAcceptedAt DateTime?
  /// Null = onboarding not finished → the console blocks on /app/onboarding.
  onboardingCompletedAt DateTime?
  /// Null after a downgrade put the tenant over its branch cap → owner must pick.
  downgradeResolvedAt   DateTime?
  deletedAt             DateTime?    // soft delete
  deleteRequestedAt     DateTime?    // owner asked for erasure
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt
  // + domain-specific business fields (category, branding, …)

  memberships        TenantMembership[]
  invitations        TenantInvitation[]
  branches           Branch[]
  subscription       Subscription?
  subscriptionEvents SubscriptionEvent[]
  payments           Payment[]
  apiClients         ApiClient[]
  trialClaim         TrialClaim?
  notifications      Notification[]
  auditLogs          AuditLog[]

  @@index([status])
  @@index([deletedAt])
  @@index([createdAt])
  @@map("tenants")
}

model TenantUser {
  id              String    @id @default(cuid())
  name            String
  email           String    @unique
  phone           String?   @unique  // normalized 62xxxxxxxxxx
  passwordHash    String?            // null = signs in only via external provider
  avatarUrl       String?
  isActive        Boolean   @default(true)
  emailVerifiedAt DateTime?
  phoneVerifiedAt DateTime?
  lastLoginAt     DateTime?
  lastSeenAt      DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  memberships    TenantMembership[]
  passwordResets PasswordReset[]
  notifications  Notification[]
  identities     TenantUserIdentity[]
  authHandoffs   AuthHandoff[]
  pushDevices    PushDevice[]

  @@index([isActive])
  @@map("tenant_users")
}

/// One row per external provider account. providerAccountId is the provider's
/// stable subject id — never the email.
model TenantUserIdentity {
  id                String   @id @default(cuid())
  tenantUserId      String
  provider          String   // 'google'
  providerAccountId String
  email             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  tenantUser TenantUser @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([tenantUserId])
  @@map("tenant_user_identities")
}

/// Single-use, short-lived code carrying a proven identity from a server-side
/// OAuth redirect back to the SPA. Only a SHA-256 hash is stored.
model AuthHandoff {
  id           String    @id @default(cuid())
  tenantUserId String
  tokenHash    String    @unique
  isNew        Boolean   @default(false)
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime  @default(now())

  tenantUser TenantUser @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)

  @@index([tenantUserId])
  @@index([expiresAt])
  @@map("auth_handoffs")
}

enum TenantRole {
  owner      // Pemilik: everything incl. billing, team, company deletion
  hr_admin   // Admin HR: full HR operations, no billing/ownership
  manager    // Atasan/Manajer: approvals + reports' attendance, no payroll/salary
  employee   // Karyawan: self-service only
}

model TenantMembership {
  id           String     @id @default(cuid())
  tenantId     String
  tenantUserId String
  role         TenantRole @default(owner)
  isActive     Boolean    @default(true)  // deactivated, never deleted
  invitedById  String?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  tenant     Tenant     @relation(fields: [tenantId], references: [id])
  tenantUser TenantUser @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)
  branches   TenantMembershipBranch[]

  @@unique([tenantId, tenantUserId])
  @@index([tenantUserId])
  @@index([tenantId])
  @@map("tenant_memberships")
}

/// Which branches a member may work in. NO ROWS MEANS EVERY BRANCH.
model TenantMembershipBranch {
  id           String   @id @default(cuid())
  tenantId     String
  membershipId String
  branchId     String
  createdAt    DateTime @default(now())

  membership TenantMembership @relation(fields: [membershipId], references: [id], onDelete: Cascade)
  branch     Branch           @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([membershipId, branchId])
  @@index([tenantId])
  @@index([branchId])
  @@map("tenant_membership_branches")
}

model TenantInvitation {
  id          String     @id @default(cuid())
  tenantId    String
  email       String
  name        String?
  role        TenantRole @default(employee)
  branchIds   Json?      // empty/null = every branch
  tokenHash   String     @unique  // SHA-256; raw token only in the email link
  invitedById String?
  expiresAt   DateTime             // 7 days
  acceptedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, email])   // one live invitation per address
  @@index([tenantId])
  @@index([email])
  @@map("tenant_invitations")
}

/// Optional multi-location module. Deactivated (not deleted) on downgrade.
model Branch {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  code      String?  @unique   // short readable code, unique platform-wide
  address   String?
  phone     String?
  timezone  String   @default("Asia/Jakarta")
  isActive  Boolean  @default(true)
  isPrimary Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant         Tenant                   @relation(fields: [tenantId], references: [id])
  memberBranches TenantMembershipBranch[]
  // + domain relations

  @@index([tenantId])
  @@index([tenantId, isActive])
  @@index([tenantId, createdAt])
  @@map("branches")
}

/// One trial per normalized email address.
model TrialClaim {
  id              String   @id @default(cuid())
  emailNormalized String   @unique
  tenantId        String   @unique
  createdAt       DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@map("trial_claims")
}

// ---------------------------------------------------------------------------
// Plans, subscriptions & billing
// ---------------------------------------------------------------------------

model Plan {
  id           String   @id @default(cuid())
  slug         String   @unique   // 'free' | 'growth' | 'business' | 'enterprise' (editable)
  name         String
  description  String?
  priceMonthly Decimal  @db.Decimal(14, 2)
  priceYearly  Decimal  @db.Decimal(14, 2)
  currency     String   @default("IDR")
  /// Numeric caps keyed by LIMIT_KEYS. -1 = unlimited.
  limits       Json
  /// Boolean switches keyed by FEATURE_KEYS.
  features     Json
  trialDays    Int      @default(14)
  isActive     Boolean  @default(true)  // can be bought
  isPublic     Boolean  @default(true)  // shown on pricing/billing pages
  order        Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  subscriptions Subscription[]

  @@map("plans")
}

enum SubscriptionStatus {
  trialing
  active
  past_due
  cancelled
  downgraded
  suspended
}

enum BillingPeriod {
  monthly
  yearly
}

/// Current state only. History is SubscriptionEvent. ONLY
/// transitionSubscription() (and the audited admin override) writes status.
model Subscription {
  id               String             @id @default(cuid())
  tenantId         String             @unique
  planId           String
  status           SubscriptionStatus @default(trialing)
  period           BillingPeriod      @default(monthly)
  trialEndsAt      DateTime?
  currentPeriodEnd DateTime?
  graceEndsAt      DateTime?
  cancelledAt      DateTime?
  downgradedAt     DateTime?
  providerRef      String?  // recurring mandate at the gateway, if supported
  provider         String?
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  tenant   Tenant    @relation(fields: [tenantId], references: [id])
  plan     Plan      @relation(fields: [planId], references: [id])
  payments Payment[]

  @@index([planId])
  @@index([status])
  @@index([trialEndsAt])
  @@index([graceEndsAt])
  @@map("subscriptions")
}

/// Append-only. Written in the same DB client/transaction as the change.
model SubscriptionEvent {
  id           String              @id @default(cuid())
  tenantId     String
  transition   String   // SubscriptionTransition | 'signup' | 'admin_override'
  fromStatus   SubscriptionStatus?
  toStatus     SubscriptionStatus
  fromPlanSlug String?
  toPlanSlug   String
  period       BillingPeriod
  createdAt    DateTime            @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([createdAt])
  @@index([tenantId, createdAt])
  @@map("subscription_events")
}

model PaymentGateway {
  id          String   @id @default(cuid())
  provider    String   @unique  // 'nexadream_hub' | …
  label       String
  isActive    Boolean  @default(false)  // exactly one may be active
  isSandbox   Boolean  @default(true)
  serverKey   String?  // AES-256-GCM ciphertext; for the hub: platform API key
  clientKey   String?  // encrypted
  merchantId  String?
  baseUrl     String?  // hub host, e.g. https://nexadream.id
  orderPrefix String?  // prefix the hub issued to this platform
  config      Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("payment_gateways")
}

enum PaymentStatus {
  pending
  paid
  failed
  expired
  refunded
  cancelled
  challenge
}

model Payment {
  id             String        @id @default(cuid())
  tenantId       String
  subscriptionId String?
  orderId        String        @unique  // ours: {{LOCAL_ORDER_PREFIX}}-<base36 time>-<rand>
  gatewayOrderId String?       @unique  // what the gateway sees (hub: PREFIX-orderId)
  provider       String
  amount         Int                    // smallest currency unit — NEVER Float
  currency       String        @default("IDR")
  status         PaymentStatus @default(pending)
  rawStatus      String?                // provider's own word, for support
  paymentType    String?
  period         BillingPeriod @default(monthly)
  planSlug       String?
  redirectUrl    String?                // hosted page — lets a pending charge be resumed
  paidAt         DateTime?
  expiresAt      DateTime?
  raw            Json?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  subscription Subscription? @relation(fields: [subscriptionId], references: [id])

  @@index([tenantId])
  @@index([subscriptionId])
  @@index([status])
  @@index([tenantId, createdAt])
  @@map("payments")
}

/// Every raw callback, stored before it is applied. dedupeKey makes provider
/// retries no-ops; admin can replay.
model PaymentWebhookEvent {
  id          String    @id @default(cuid())
  provider    String
  dedupeKey   String    @unique  // `${provider}:${sha256(driver.webhookDedupeSource(payload))}`
  orderId     String?
  payload     Json
  headers     Json?
  processedAt DateTime?
  error       String?
  replayCount Int       @default(0)
  createdAt   DateTime  @default(now())

  @@index([provider])
  @@index([orderId])
  @@index([createdAt])
  @@map("payment_webhook_events")
}

// ---------------------------------------------------------------------------
// Public API clients (plan feature `apiAccess`)
// ---------------------------------------------------------------------------

model ApiClient {
  id         String    @id @default(cuid())
  tenantId   String
  name       String
  keyHash    String    @unique   // SHA-256 of the plaintext; plaintext shown once
  keyPrefix  String              // first 16 chars, for display/lookup
  scopes     String[]            // 'read' | 'write'
  lastUsedAt DateTime?
  isActive   Boolean   @default(true)
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([keyPrefix])
  @@map("api_clients")
}

// ---------------------------------------------------------------------------
// Auth support
// ---------------------------------------------------------------------------

enum AuthAudience {
  tenant
  platform
}

model PasswordReset {
  id           String       @id @default(cuid())
  audience     AuthAudience
  userId       String?
  tenantUserId String?
  tokenHash    String       @unique  // SHA-256; 2-hour TTL
  expiresAt    DateTime
  usedAt       DateTime?
  createdAt    DateTime     @default(now())

  user       User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantUser TenantUser? @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tenantUserId])
  @@index([expiresAt])
  @@map("password_resets")
}

/// Back-office staff invitation (there is no public /admin registration).
model Invitation {
  id          String    @id @default(cuid())
  email       String
  name        String?
  roleId      String
  tokenHash   String    @unique
  invitedById String?
  expiresAt   DateTime            // 7 days
  acceptedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  role      Role  @relation(fields: [roleId], references: [id])
  invitedBy User? @relation("InvitationInvitedBy", fields: [invitedById], references: [id])

  @@index([email])
  @@index([roleId])
  @@map("invitations")
}

model AuditLog {
  id             String       @id @default(cuid())
  audience       AuthAudience
  actorId        String?      // FK only for platform users
  actorName      String?
  impersonatorId String?      // set inside an impersonated session
  tenantId       String?
  action         String       // English slug: 'auth.sign_in', 'tenant.suspend'
  targetType     String?
  targetId       String?
  metadata       Json?        // tenant actor id lives here as tenantUserId
  ip             String?
  userAgent      String?
  createdAt      DateTime     @default(now())

  actor  User?   @relation(fields: [actorId], references: [id])
  tenant Tenant? @relation(fields: [tenantId], references: [id])

  @@index([actorId])
  @@index([tenantId])
  @@index([action])
  @@index([createdAt])
  @@map("audit_logs")
}

// ---------------------------------------------------------------------------
// Notifications & email
// ---------------------------------------------------------------------------

model Notification {
  id           String       @id @default(cuid())
  audience     AuthAudience
  userId       String?      // platform recipient
  tenantUserId String?      // tenant recipient
  tenantId     String?
  templateKey  String?
  title        String
  body         String
  actionUrl    String?
  icon         String?
  level        String       @default("info") // info | success | warning | error
  readAt       DateTime?
  createdAt    DateTime     @default(now())

  user       User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantUser TenantUser? @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)
  tenant     Tenant?     @relation(fields: [tenantId], references: [id])

  @@index([userId, readAt])
  @@index([tenantUserId, readAt])
  @@index([tenantId])
  @@index([createdAt])
  @@map("notifications")
}

enum PushPlatform {
  android
  web
}

model PushDevice {
  id           String       @id @default(cuid())
  tenantUserId String
  tenantId     String?      // plain column, not a relation
  token        String       @unique  // re-registering moves it to the latest user
  platform     PushPlatform
  appVersion   String?
  lastSeenAt   DateTime     @default(now())
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  tenantUser TenantUser @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)

  @@index([tenantUserId, tenantId])
  @@map("push_devices")
}

enum ScheduledNotificationStatus {
  scheduled
  sending
  sent
  failed
}

/// Admin-queued broadcast push to the 'all' topic at a fixed slot.
model ScheduledNotification {
  id           String                      @id @default(cuid())
  title        String
  body         String
  scheduledFor DateTime
  status       ScheduledNotificationStatus @default(scheduled)
  sentAt       DateTime?
  error        String?
  createdById  String?
  createdAt    DateTime                    @default(now())
  updatedAt    DateTime                    @updatedAt

  @@index([status, scheduledFor])
  @@index([scheduledFor])
  @@map("scheduled_notifications")
}

model EmailTemplate {
  id          String   @id         // deterministic
  key         String   @unique     // 'password_reset'
  name        String               // product language
  subject     String
  body        String               // HTML with {{token}} placeholders
  description String?
  variables   Json                 // [{ token, label, sample }]
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("email_templates")
}

model NotificationTemplate {
  id          String   @id
  key         String   @unique
  name        String
  title       String
  body        String
  actionLabel String?
  actionUrl   String?
  icon        String?
  level       String   @default("info")
  variables   Json
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("notification_templates")
}

// ---------------------------------------------------------------------------
// Settings & CMS
// ---------------------------------------------------------------------------

model AppSetting {
  key       String   @id
  value     String?
  group     String          // company | smtp | billing | privacy | app | system
  type      String   @default("string") // string|number|boolean|json|secret|text|select
  label     String
  isSecret  Boolean  @default(false)    // encrypted at rest, masked on read
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([group])
  @@map("app_settings")
}

model Page {
  id              String   @id @default(cuid())
  slug            String   @unique  // privacy, terms, payment policy, help …
  title           String
  content         String           // HTML from the rich-text editor
  excerpt         String?
  metaTitle       String?
  metaDescription String?
  isPublished     Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@map("pages")
}

model Faq {
  id        String   @id @default(cuid())
  question  String
  answer    String
  category  String   @default("umum")
  order     Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([order])
  @@map("faqs")
}

enum ContactMessageStatus {
  new
  read
  replied
  archived
}

model ContactMessage {
  id        String               @id @default(cuid())
  name      String
  email     String
  phone     String?
  subject   String?
  message   String
  status    ContactMessageStatus @default(new)
  ip        String?
  handledAt DateTime?
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  @@index([status])
  @@index([createdAt])
  @@map("contact_messages")
}

// ---------------------------------------------------------------------------
// Product analytics — counters, never a person
// ---------------------------------------------------------------------------

enum UsagePlatform {
  web
  android
}

enum UsageDevice {
  phone
  tablet
  desktop
}

/// One row per day per platform per form factor. Unit = device-day.
model UsageDaily {
  dateKey   String        // "YYYY-MM-DD" on the platform clock
  platform  UsagePlatform
  device    UsageDevice
  count     Int           @default(0)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@id([dateKey, platform, device])
  @@map("usage_daily")
}
```

## 4. Seeded reference data

Seed (`prisma/seed.ts`) is **idempotent upserts** reading from the shared
catalogs. Reference rows and their deterministic ids:

| Data | Source catalog | Id pattern |
|---|---|---|
| Permissions | `shared/utils/permissions.ts` (`PERMISSION_KEYS`) | cuid, unique `key` |
| Roles `superadmin`, `admin`, `support` | seed | `role-{slug}` |
| Menus | `shared/utils/menus.ts` (`MENU_TREE` → `flattenMenuTree`) | `menu-{slug}` |
| App settings | `shared/utils/settings.ts` (`SETTINGS_CATALOG`) | `key` is the PK |
| Email templates | `shared/utils/templates.ts` (`EMAIL_TEMPLATES`) | `email-{key}` |
| Notification templates | `NOTIFICATION_TEMPLATES` | `notif-{key}` |
| Plans `free`, `growth`, `business`, `enterprise` | seed | `plan-{slug}` |
| Payment gateways | seed (inactive, no credentials) | `gateway-{provider}` |
| Pages `privacy`, `terms`, payment policy, help center | seed | cuid, unique `slug` |
| FAQ entries | seed | cuid |
| First superadmin user | seed (dev password; change in prod) | |

Default plan seed (D4 — **proposed**, pricing is a placeholder; editable in
`/admin/plans`; code reads limits/features by key only). `-1` = unlimited.
Yearly price = 10 x monthly (proposed). Enterprise price is custom (set per
deal; seed value 0 / contact sales).

```ts
const ALL_OFF = { leaveManagement: false, shiftScheduling: false, attendanceGeofence: false,
  overtime: false, reimbursement: false, payroll: false, performanceReview: false,
  documentVault: false, export: false, import: false, multiBranchRollup: false,
  branchScopedRoles: false, customApprovalFlows: false, activityLog: false,
  apiAccess: false, prioritySupport: false }

const plans = [
  { slug: 'free', name: 'Free', priceMonthly: 0, priceYearly: 0, trialDays: 0, order: 0,
    limits:   { employees: 10, branches: 1, teamMembers: 1, reportRetentionDays: 90, storageMb: 100 },
    features: { ...ALL_OFF, leaveManagement: true } },
  { slug: 'growth', name: 'Growth', priceMonthly: 199000, priceYearly: 1990000, trialDays: 14, order: 1,
    limits:   { employees: 50, branches: 3, teamMembers: 3, reportRetentionDays: 365, storageMb: 1024 },
    features: { ...ALL_OFF, leaveManagement: true, shiftScheduling: true, attendanceGeofence: true,
                overtime: true, reimbursement: true, documentVault: true, export: true } },
  { slug: 'business', name: 'Business', priceMonthly: 599000, priceYearly: 5990000, trialDays: 14, order: 2,
    limits:   { employees: 250, branches: 10, teamMembers: 10, reportRetentionDays: 1095, storageMb: 10240 },
    features: { ...ALL_OFF, leaveManagement: true, shiftScheduling: true, attendanceGeofence: true,
                overtime: true, reimbursement: true, payroll: true, performanceReview: true,
                documentVault: true, export: true, import: true, multiBranchRollup: true,
                branchScopedRoles: true, activityLog: true } },
  { slug: 'enterprise', name: 'Enterprise', priceMonthly: 0 /* custom */, priceYearly: 0, trialDays: 14, order: 3,
    limits:   { employees: -1, branches: -1, teamMembers: -1, reportRetentionDays: -1, storageMb: -1 },
    features: Object.fromEntries(Object.keys(ALL_OFF).map(k => [k, true])) }
]
```

Per-tier feature values above (beyond the limits table in D4) are **proposed**;
D4 fixes the keys and limits. Open: per-employee pricing instead of flat tiers
(D4) — ask the owner before building billing.

Seed roles:

```ts
const all = PERMISSION_KEYS
// admin: everything except what lets someone widen their own access
const adminKeys = all.filter(k => ![ 'roles.write', 'permissions.write', 'menus.write' ].includes(k))
// support: every .read except revenue reports, plus replying to messages
const supportKeys = all.filter(k => k.endsWith('.read') && k !== 'reports.read').concat(['messages.write'])
```

On each role upsert, `role_permissions` for that role is deleted and
re-created from the list.

## 5. Shipping new reference data to production (MUST)

`prisma migrate deploy` runs in the build. The seed does **not** travel with a
deploy, and re-running it overwrites admin edits. So when a feature needs a new
permission, menu, template, setting or plan:

1. Add it to the shared catalog (so a fresh `db:reset` is complete).
2. **Also** write it into a **new** migration's `migration.sql` as an
   idempotent insert, supplying `id` and `updatedAt` explicitly (raw SQL
   bypasses Prisma defaults):

   ```sql
   INSERT INTO "menus" ("id","parentId","label","slug","path","icon","permissionKey","order","isActive","createdAt","updatedAt")
   VALUES ('menu-webhook-events','menu-business','Payment callback','webhook-events','/admin/webhook-events','i-lucide-webhook','payments.read',5,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
   ON CONFLICT ("slug") DO NOTHING;
   ```

3. Never edit a migration that has already been applied.

Partial unique indexes (e.g. "at most one active X per tenant") are written by
hand in migration SQL — Prisma cannot express them.
