# HRIS Nexadream — Design Reference

Visual and UI-pattern reference for the web app. Status: **proposed** (no
brand assets were provided) — replace the palette once the Nexadream brand is
confirmed. Tokens are meant to be mapped into
`web/hris-nexadream/app/assets/css/main.css` using Tailwind v4 `@theme`
(no `tailwind.config.js`) on top of **Nuxt UI v4**. Never hand-roll a component
Nuxt UI already provides.

## 1. Principles

1. **Calm, trustworthy, data-dense.** HR users live in tables and forms all
   day; prefer clarity and scan-ability over decoration.
2. **Employees first on mobile.** The self-service surface (clock in, leave,
   payslip) is designed phone-first; the HR console is designed desktop-first
   but must work on tablet.
3. **Sensitive by default.** Salary, NIK, NPWP, bank and BPJS values are masked
   (`•••• 1234`) until explicitly revealed with the right ability; revealing is
   an audited action and shows a visible state.
4. **One status vocabulary.** Every enum renders through the label map in
   `shared/utils/status.ts` + a single `<StatusBadge>`; never a raw slug.
5. **Bahasa Indonesia UI**, formal-but-friendly ("Anda"), short verbs
   ("Simpan", "Ajukan", "Setujui", "Tolak").
6. Light and dark mode both supported; default light.

## 2. Color tokens (proposed)

Primary is an indigo-teal that reads as "professional, modern".

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary-50 … 950` | indigo-ish scale, 600 = `#4F46E5` | 400 = `#818CF8` | Actions, links, focus |
| `--color-accent` | `#14B8A6` (teal-500) | `#2DD4BF` | Highlights, "present" states |
| `--color-neutral-*` | slate scale | slate scale | Text, borders, surfaces |
| `--color-success` | `#16A34A` | `#4ADE80` | Approved, present, paid |
| `--color-warning` | `#D97706` | `#FBBF24` | Pending, late, expiring |
| `--color-error` | `#DC2626` | `#F87171` | Rejected, absent, failed |
| `--color-info` | `#0284C7` | `#38BDF8` | Informational |

Surface layers: `bg-default` (page), `bg-muted` (sunken areas), `bg-elevated`
(cards, popovers). Text: `text-default`, `text-muted`, `text-dimmed`.
Contrast must meet WCAG AA (4.5:1 body, 3:1 large/UI).

### Status → badge colour (single source: `shared/utils/status.ts`)

| Domain | Value → colour |
|---|---|
| Employee | `active` success · `probation` info · `on_leave` warning · `inactive`/`terminated` neutral |
| Attendance | `present` success · `late` warning · `absent` error · `leave` info · `holiday` neutral |
| Request (leave/overtime/reimbursement) | `pending` warning · `approved` success · `rejected` error · `cancelled` neutral |
| Payroll run | `draft` neutral · `calculated` info · `approved` primary · `paid_recorded` success · `void` error |
| Subscription | `trialing` info · `active` success · `past_due` warning · `cancelled`/`suspended` error · `downgraded` neutral |

## 3. Typography

- Font: **Inter** (UI) with system fallbacks; numerals `tabular-nums` in tables,
  payroll and attendance times.
- Scale: `text-xs 12` captions/badges · `text-sm 14` **default UI and tables** ·
  `text-base 16` body/forms on mobile · `text-xl 20` section titles ·
  `text-2xl 24` page titles · `text-4xl+` landing hero only.
- Weights: 400 body, 500 labels/nav, 600 headings.

## 4. Spacing, radius, elevation

- 4 px base grid. Page padding `p-4` mobile, `p-6` desktop; card padding `p-4/6`.
- Radius: `rounded-md` (6) inputs/buttons, `rounded-lg` (8) cards, `rounded-full`
  avatars and badges.
- Elevation: borders first (`ring-1 ring-default`), shadow only for popovers,
  slideovers and the sticky mobile action bar.

## 5. Layout

| Surface | Shell | Notes |
|---|---|---|
| Landing (`/`) | `public` layout | Sticky top nav, sections, footer; SSR. |
| Company console (`/app`) | `tenant` layout | Left sidebar (collapsible rail) + top bar (branch switcher, bell, user menu). |
| Employee self-service (`/app` as role `employee`) | same shell, reduced nav; **bottom tab bar on phones** | Big primary "Clock in / Clock out" card on home. |
| Back-office (`/admin`) | `admin` layout | DB-driven sidebar (menus table). |
| Auth pages | `auth-tenant` / `auth-admin` | Centered card, max-w-md. |

Breakpoints: phone < 640, tablet 640–1023, desktop ≥ 1024. Tables become card
lists below 640. Sidebar becomes a drawer below 1024.

## 6. Core components

- `<CommandBar>` — page title, breadcrumb, primary action(s), search.
- Tables: `useServerList` (server pagination, debounced search ≥ 2 chars,
  filters reset page), sticky header, row actions in a dropdown, empty state.
- `<FormSlideover>` for create/edit; full pages only for long forms
  (employee profile, payroll run).
- `useConfirmDialog` for destructive actions (always states the consequence).
- `<StatusBadge>`, `<MaskedValue>` (reveal with audit), `<EmployeeAvatar>`
  (initials fallback), `<BranchSwitcher>`, `<TrialBanner>`,
  `<UpgradeDialog>` (opened by any 402), `<ImpersonationBanner>`.
- Toasts for success; inline errors for validation; `handlePlanError` on every
  write.

## 7. HR-specific UI patterns

- **Employee profile**: header (photo, name, position, branch, status) + tabs
  *Ringkasan · Pekerjaan · Kehadiran · Cuti · Payroll · Dokumen · Riwayat*.
  Payroll/Dokumen tabs hidden without ability; sensitive fields masked.
- **Clock in/out card**: current branch time (branch timezone), large button,
  geofence status chip ("Dalam area kantor" / "Di luar area"), optional selfie,
  last 5 entries. Offline/slow network: disable button while pending, never
  double-submit.
- **Attendance calendar**: month grid, colour dots from status map; day click
  opens a slideover with entries and correction request.
- **Approval inbox** (managers/HR): tabs by request type, bulk approve,
  reject requires a reason; shows requester, dates, balance impact.
- **Leave**: balance cards per leave type, date-range picker that skips
  weekends/holidays and shows the computed number of days before submit.
- **Payroll run**: stepper *Periode → Hitung → Tinjau → Setujui → Terbitkan*;
  summary cards (total gross, deductions, net, headcount) and a diff warning
  list (employees with ±X% change vs last run). Approved runs are read-only.
- **Payslip**: clean printable layout (A4), IDR formatting `Rp 1.234.567`,
  components grouped *Pendapatan / Potongan / Take-home pay*.
- **Org chart / reporting lines**: tree view, collapsible, lazy-loaded.

## 8. Formatting

- Currency `Rp 1.234.567` (no decimals in UI unless needed); thousands `.`,
  decimal `,` (id-ID). Amounts in tables right-aligned, `tabular-nums`.
- Dates `15 Okt 2026`; times 24h `08:05` in the **branch** timezone with the
  zone label (WIB/WITA/WIT) where ambiguity is possible.
- Phone normalized `62…`, displayed `+62 8xx-xxxx-xxxx`.

## 9. Accessibility & states

- Keyboard reachable, visible focus ring (`primary-500`), icon-only buttons
  have `aria-label`, colour is never the only status signal (badge text +
  icon).
- Every list/page has loading (skeleton), empty (with a next action) and error
  (with retry) states.
- Respect `prefers-reduced-motion`; transitions ≤ 150 ms.

## 10. Icons & imagery

`i-lucide-*` via Nuxt UI. Illustration style: flat, 2–3 brand colours, used
only on empty states and landing. Employee photos are optional; always provide
an initials avatar.
