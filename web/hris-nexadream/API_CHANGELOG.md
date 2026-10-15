# API Changelog — `/api/v1`

Kontrak publik dibekukan (12-api-conventions.md §7.1): endpoint dan field hanya **ditambah**;
tidak pernah dihapus, diganti nama, atau diubah tipe/maknanya. Perubahan yang memutus kontrak
dirilis sebagai `/api/v2`. Referensi: `/docs/api` dan `/api/v1/openapi.json` (dibangun dari
`shared/utils/api-docs.ts`).

## 1.0.0 (Draft)

- Amplop `{ data }` / `{ data, meta }` / `{ error: { code, message, status, details } }`.
- Autentikasi Bearer (login) dan `X-Api-Key` (`hn_live_…` / `hn_test_…`, fitur paket `apiAccess`)
  dengan scope `read`, `write`, `sensitive`.
- Gerbang versi aplikasi mobile: header `x-hrisnexadream-client: HRISNexadream/<semver>` →
  `426 UPGRADE_REQUIRED` bila di bawah `app.minimumMobileVersion`.
- Endpoint: `GET /settings/public` (ETag), `GET /plans` (ETag), `POST /auth/login`, `POST /auth/logout`,
  `GET /me`, `GET /branches`, `GET /departments`, `GET /positions`, `GET|POST /employees`,
  `GET|PATCH /employees/{id}`, `GET /attendance/daily`, `GET /me/attendance/today`,
  `POST /me/attendance/clock-in`, `POST /me/attendance/clock-out`, `GET /leave/requests`,
  `POST /leave/requests/{id}/decide`, `GET|POST /me/leave`, `GET /payroll/runs`, `GET /payroll/runs/{id}`,
  `GET /me/payslips`, `GET /me/payslips/{id}`, `GET|POST /api-keys`, `DELETE /api-keys/{id}`,
  `GET /openapi.json`.
