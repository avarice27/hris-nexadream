# 14 — Landing Site & Public Surface

## 1. Pages

| Route | Rendering | Content source |
|---|---|---|
| `/` | SSR, indexable, layout `public.vue` | `GET /api/public/landing` (plans, FAQ, company, `registrationOpen`) |
| `/page/:slug` | SSR | `GET /api/public/pages/:slug` (published `Page` row) |
| `/privacy`, `/terms` | SSR | the `Page` rows with those slugs |
| `/hapus-akun` (account and company data deletion info) | SSR | `GET /api/public/site` privacy commitments — explains deletion of an employee account vs. company data, retention exceptions (payroll/tax records) and the erasure request channel (`16` §3b) |
| `/docs/api` | SSR | generated from `shared/utils/api-docs.ts` (`enterprise` endpoints only) |
| `/internal/api` | SSR, noindex | full catalog; only when `app.internalApiDocsEnabled` |
| `[...slug].vue` | catch-all | 404 page |

Nothing about pricing, plan limits, FAQ or legal copy is hard-coded in the
page: it all comes from the DB and is editable in `/admin`.

## 2. Landing page structure (HRIS Nexadream)

Audience: Indonesian SMEs (UMKM / small and mid-size companies, roughly 10–250
employees) whose HR runs on spreadsheets and chat groups. Copy is Bahasa
Indonesia, plain and second person ("Anda"). Tagline is `company.tagline`
(proposed default: "HR, absensi, dan payroll untuk bisnis Indonesia dalam satu
aplikasi"). Only the **section skeleton** is fixed; wording comes from the DB.

Sections, each with an anchor id used by the header nav (`scroll-mt-*` so the
sticky header doesn't cover the heading):

1. **Hero** (`#beranda`) — headline + tagline (`company.tagline`), primary CTA
   "Coba gratis" → `/app/auth/register` (hidden or replaced when
   `registrationOpen` is false), secondary CTA "Masuk" → `/app/auth/login`,
   product mockup.
2. **Features** (`#fitur`) — cards, each tied to a plan feature:
   - **Absensi** — clock in/out from phone, shifts, optional geofence/selfie, per-office timezone (WIB/WITA/WIT).
   - **Cuti & lembur** — leave balances, approval flow, overtime and reimbursement.
   - **Payroll** — PPh 21 (TER), BPJS Kesehatan/Ketenagakerjaan, THR, payslips. Honest note: Nexadream calculates and records payroll; the transfer itself is done by the company (D5).
   - **Employee self-service (ESS)** — employees see payslips, leave and requests on their own phone.
   - **Dokumen karyawan** — private document vault.
   - **Multi-cabang** — several offices under one company.
3. **Why us** (`#keunggulan`) — built for Indonesian rules (UU Ketenagakerjaan, BPJS, PPh 21), data protection per UU PDP, Indonesian support. No unverifiable claims ("100% sesuai peraturan") — say "mengikuti ketentuan terbaru" only if maintained.
4. **How it works / demo strip** — 3 steps: daftar perusahaan, impor karyawan, jalankan absensi dan payroll.
5. **Pricing** (`#harga`) — one card per active+public plan, monthly/yearly
   toggle (yearly shows the saving), limits via `formatLimit` and features via
   `FEATURE_META` labels, trial days on the trial plan, CTA to register.
   Prices formatted `Rp 99.000`. Plans come from `D4`: Free (10 karyawan, 1
   kantor), Growth (Rp 199.000/bulan, 50 karyawan, 3 kantor), Business (Rp
   599.000/bulan, 250 karyawan, 10 kantor), Enterprise ("Hubungi kami", custom,
   CTA to `#kontak` instead of checkout). Prices are placeholders; never
   hard-code them in the page. The comparison shows the employee limit first,
   because that is what an SME buyer compares. Add a line "Karyawan tidak
   membayar; langganan dibayar perusahaan." If per-employee pricing is adopted
   (D4 open question) the card format changes.
6. **Articles** (optional, `#artikel`) — external blog proxy; the section
   removes itself when the list is empty or loading fails.
7. **FAQ** (`#faq`) — active FAQ rows ordered. Example seeds: "Apakah
   perhitungan PPh 21 dan BPJS sudah otomatis?", "Apakah data karyawan aman?
   (enkripsi, UU PDP)", "Apakah Nexadream mentransfer gaji karyawan?" (tidak,
   hanya menghitung dan mencatat), "Bisa dipakai untuk lebih dari satu
   kantor/zona waktu?", "Apakah karyawan perlu bayar?", "Bagaimana cara
   memindahkan data dari Excel?", "Apa yang terjadi jika masa trial berakhir?".
8. **Contact** (`#kontak`) — company phone/email/WhatsApp/address + contact
   form.
9. **Final CTA** band, then the shared **footer** (company identity, social
   icons only when set, Play badge only when set, links to legal pages and
   `/docs/api`).

Motion: the landing page may be slightly more expressive than the consoles —
a reveal-on-scroll directive (500 ms ease-out) — with two safety guards: the
hidden state applies only once a runtime class is set on `<html>` (so content
can never stay hidden if JS fails), and only under
`prefers-reduced-motion: no-preference`. The directive's plugin must be
**universal** (SSR needs `getSSRProps` returning `{}`), not `.client`.

## 3. Public endpoints

```
GET  /api/public/landing       → { plans[], faqs[], company{…, playStoreUrl}, registrationOpen }
GET  /api/public/site          → { company{name, tagline, email, phone, whatsapp, address, socials…, playStoreUrl},
                                   privacy{contactEmail, deleteRequestSlaDays, auditRetentionDays,
                                           backupRetentionDays, financialRetentionYears} }
GET  /api/public/pages/:slug   → published page (404 otherwise)
GET  /api/public/articles      → optional external blog proxy (never throws; cached incl. failures)
POST /api/contact              → contact form
```

`/api/public/site` is deliberately smaller than `/landing` (fetched by every
public page footer). `getAllSettings()` is cached, so these reads are cheap.

### Contact form — `POST /api/contact`

```ts
z.object({
  name: z.string().min(2),
  email: z.email(),
  phone: z.string().optional(),
  subject: z.string().optional(),
  message: z.string().min(10),
  website: z.string().max(0).optional()   // honeypot: bots fill it, humans never see it
})
```

1. Rate limit per IP: setting `app.contactRateLimitPerHour` per hour.
2. Store `ContactMessage` (email lowercased, phone normalized, IP).
3. Email `contact_enquiry` to `company.email` (if set).
4. `notifyPlatform('messages.read', { templateKey: 'admin_new_message' })` —
   bell only.
5. Staff handle it at `/admin/messages`.

## 4. SEO

- `useSeoMeta` per page (title, description, OG tags); `htmlAttrs.lang` set
  to the product language.
- Landing emits JSON-LD structured data: `Organization` plus
  `SoftwareApplication` (`applicationCategory: "BusinessApplication"`,
  `operatingSystem: "Web"`, `inLanguage: "id-ID"`, `offers` generated from the
  active public plans in IDR, `priceCurrency: "IDR"`) and `FAQPage` built from
  the FAQ rows. Link the Play listing via `company.playStoreUrl` only if a
  mobile app ever exists (out of scope now). Target keywords (Indonesian):
  aplikasi HRIS, absensi online, aplikasi payroll, hitung PPh 21 dan BPJS,
  software HR untuk UMKM. Set `htmlAttrs.lang = 'id'`.
- `server/routes/robots.txt.ts`:

  ```
  User-agent: *
  Allow: /
  Disallow: /app/
  Disallow: /admin/
  Disallow: /api/
  Disallow: /internal/
  Sitemap: {{SITE_URL}}/sitemap.xml
  ```

- `server/routes/sitemap.xml.ts`: `/`, `/docs/api`, `/hapus-akun`, and every
  published `Page` (`/privacy`, `/terms` mapped to their short routes,
  others at `/page/:slug`), with `lastmod` from `updatedAt`.
- Favicons / touch icons in `public/`; the console manifest is separate (see
  `13` §8).

## 5. CMS content seeded at install

| Page slug | Purpose |
|---|---|
| `privacy` | privacy policy under **UU PDP (UU No. 27/2022)**: roles (the company is the data controller of its employees' data, Nexadream the processor; Nexadream is controller for company-owner account data), categories (identity, NIK/NPWP/BPJS, bank, salary, attendance location/selfie, family), purposes, encryption and access logging, retention and the payroll/tax record exceptions, data-subject rights (access, correction, erasure, objection) and how to exercise them, breach notification, contact `{{SUPPORT_EMAIL}}`. Needs legal review before launch |
| `terms` | terms of service (subscription, trial, cancellation, refunds) |
| payment policy | how subscription payments, renewals and refunds work |
| help center | getting-started guide (set up company, offices, import employees, leave policy, first payroll run, invite employees to ESS) |
| data processing terms (optional) | DPA-style addendum for companies, referenced from `terms` (proposed) |

Plus a starter FAQ set (what is it, trial, payment methods, cancellation, data
safety, support). All editable at `/admin/pages` and `/admin/faq`.
