// Mencetak SQL idempoten untuk mengirim templat katalog ke DB produksi lewat migrasi
// (seed tidak ikut deploy). Pakai: npx tsx scripts/template-migration-sql.ts > prisma/migrations/<ts>_x/migration.sql
import { EMAIL_TEMPLATES, NOTIFICATION_TEMPLATES } from '../shared/utils/templates'

const q = (value: unknown) => value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, '\'\'')}'`

const lines: string[] = ['-- Templat email & notifikasi dari katalog (idempoten; tidak menimpa suntingan admin).']

for (const t of EMAIL_TEMPLATES) {
  const values = [q(`email-${t.key}`), q(t.key), q(t.name), q(t.subject), q(t.body), q(t.description), `${q(JSON.stringify(t.variables))}::jsonb`, 'true', 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP']
  lines.push(`INSERT INTO "email_templates" ("id","key","name","subject","body","description","variables","isActive","createdAt","updatedAt") VALUES (${values.join(',')}) ON CONFLICT ("key") DO NOTHING;`)
}

for (const t of NOTIFICATION_TEMPLATES) {
  const values = [q(`notif-${t.key}`), q(t.key), q(t.name), q(t.title), q(t.body), q(t.actionLabel), q(t.actionUrl), q(t.icon), q(t.level), `${q(JSON.stringify(t.variables))}::jsonb`, 'true', 'CURRENT_TIMESTAMP', 'CURRENT_TIMESTAMP']
  lines.push(`INSERT INTO "notification_templates" ("id","key","name","title","body","actionLabel","actionUrl","icon","level","variables","isActive","createdAt","updatedAt") VALUES (${values.join(',')}) ON CONFLICT ("key") DO NOTHING;`)
}

const reset = EMAIL_TEMPLATES.find(t => t.key === 'password_reset')!
lines.push('')
lines.push('-- password_reset kini memakai {{expiresInHours}}; diperbarui hanya bila masih salinan fase 3 (belum diedit admin).')
lines.push(`UPDATE "email_templates" SET "body" = ${q(reset.body)}, "variables" = ${q(JSON.stringify(reset.variables))}::jsonb, "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'password_reset' AND "body" LIKE '%berlaku selama 2 jam%';`)

process.stdout.write(`${lines.join('\n')}\n`)
