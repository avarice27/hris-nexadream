# Compliance reference (Indonesia) — checked 2026-10-31

Source notes behind the payroll rates, holiday calendar, invoice/PPN handling and
legal pages. Items marked **[verify]** were taken from secondary sources or from
knowledge of the regulation text and must be checked against the primary PDF
before go-live. Rates live in data (`reference_data` key `payroll`, holidays
table), never in code literals.

## Payroll

| Item | Value | Basis |
|---|---|---|
| PPh 21 TER A/B/C (monthly) | Engine tables match PP 58/2023 Lampiran A/B/C (44/40/41 layers). B has no 1.25% layer (C does at Rp8.85–9.2 jt) — regulation quirk, keep. | PP 58/2023; transcription calcuid.com, cross-checked with PMK 168/2023 examples **[verify Lampiran scan]** |
| TER category | A = TK/0, TK/1, K/0 · B = TK/2, TK/3, K/1, K/2 · C = K/3; status fixed as of 1 Jan | PP 58/2023 |
| TER daily | ≤ Rp450.000 0%; Rp450.001–2.500.000 0,5% | PP 58/2023 Lampiran D |
| Last period | December / exit month recomputed with Pasal 17 | PMK 168/2023 |
| Pasal 17 | 5% ≤60 jt · 15% ≤250 jt · 25% ≤500 jt · 30% ≤5 M · 35% > 5 M | UU 7/2021 (HPP) |
| PTKP | 54 jt + 4,5 jt married + 4,5 jt/dependent (max 3) | PMK 101/2016 (unchanged 2026) |
| Biaya jabatan | 5%, max Rp6 jt/yr (Rp500 rb/mo); annual recompute only | PMK 168/2023 Ps. 10(2) |
| PPh 21 gross includes | employer JKK, JKM, BPJS Kesehatan 4% | PMK 168/2023 Ps. 5(3) |
| Annual deductions | employee JHT 2% + JP 1% (not BPJS Kes 1%) | PMK 168/2023 |
| PPh 21 DTP 2026 | PMK 105/2025: 5 labour-intensive/tourism sectors (133 KLU), gross ≤ Rp10 jt tested in January; paid to employee in cash, not taxable. Not modelled yet. | PMK 105/2025 (2025: PMK 10/2025) |
| BPJS Kesehatan | 4% company + 1% employee; wage cap Rp12 jt | Perpres 82/2018 Ps. 32 jo. 64/2020, 59/2024 **[verify]** |
| JHT | 3,7% company + 2% employee; no cap | PP 46/2015 |
| JP | 2% company + 1% employee; cap **Rp10.547.400** (1 Mar 2025) → **Rp11.086.300 from 1 Mar 2026** | PP 45/2015; BPJS TK announcement Mar 2026 |
| JKK | 0,24 / 0,54 / 0,89 / 1,27 / 1,74% by risk class (50% discount for labour-intensive sectors ended with Jan 2026 contribution) | PP 44/2015; PP 7/2025, PP 36/2025 **[verify base rates]** |
| JKM | 0,30% company | PP 44/2015 **[verify]** |
| JKP | no extra contribution (government + re-allocated JKK) | PP 37/2021 jo. PP 6/2025 |
| Overtime | hourly = 1/173 × monthly wage; workday 1,5× first hour then 2×; rest day 5-day week 2× h1–8, 3× h9, 4× h10–12; 6-day week 2× h1–7, 3× h8, 4× h9–11 (shortest day: 2× h1–5, 3× h6, 4× h7–9); max 4 h/day, 18 h/week | PP 35/2021 Ps. 26, 31, 32 |
| THR | ≥ 12 months: 1× wage; 1–<12 months: months/12 × wage; due H-7, in full | Permenaker 6/2016; SE M/3/HK.04.00/III/2026 **[verify pro-rata wording]** |

## Holidays 2026 (SKB 1497/2025, 2/2025, 5/2025; Keppres 42/2025 for ASN)

17 libur nasional + 8 cuti bersama — seeded as platform holidays by migration
`*_holidays_2026_2027`. Cuti bersama is optional for private companies and may
be charged to annual leave (tenant setting). 2027 per SKB 1205/2026, 3/2026,
2/2026 (18 + 8). Islamic dates can move after sidang isbat → keep editable.

## PPN on subscriptions

- PPN 12% × DPP Nilai Lain (11/12 × price) = effective 11% for non-luxury
  services (PMK 131/2024). SaaS is not PPnBM → 11% effective. Faktur code 04.
- The platform's invoice/receipt is a commercial document. The **Faktur Pajak is
  issued only in DJP Coretax** (PMK 81/2024, PER-11/PJ/2025 Ps. 33); store its
  number afterwards.
- Bea meterai Rp10.000 applies to a *receipt* (proof of payment) above
  Rp5.000.000, including electronic documents → e-Meterai (UU 10/2020 Ps. 3(2)g,
  5). Payslips are exempt (Ps. 7).

## Legal pages

- UU 27/2022 (PDP): tenant = controller, platform = processor for employee data
  (Ps. 51); lawful bases Ps. 20; specific data Ps. 4; rights Ps. 5–13; breach
  notice 3×24 h (Ps. 46); DPO Ps. 53; cross-border transfer Ps. 56; retention
  Ps. 43–44. PP 33/2026 (in force 16 Jan 2027) **[verify]**.
- PSE registration via OSS before use (PP 71/2019, Permenkominfo 5/2020).
- Standard clauses: avoid what UU 8/1999 Ps. 18 forbids (unilateral changes
  binding consumers, liability shifts, no-refund-ever wording).
- Agreements with Indonesian parties in Bahasa Indonesia (UU 24/2009 Ps. 31,
  Perpres 63/2019 Ps. 26).
- Retention: books & supporting records 10 years (UU KUP Ps. 28(11); UU 8/1997
  Ps. 11) → `privacy.financialRetentionYears = 10`.
