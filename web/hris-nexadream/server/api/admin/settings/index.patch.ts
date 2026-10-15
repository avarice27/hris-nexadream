import { z } from 'zod'

const bodySchema = z.object({ values: z.record(z.string(), z.unknown()) })

export default defineEventHandler(async (event) => {
  const ctx = await requirePermission(event, 'settings.write')
  const body = await readValidatedJson(event, bodySchema)
  const result = await updateSettingsFromAdmin(body.values)
  await recordAudit(event, {
    audience: 'platform',
    action: 'settings.update',
    actorId: ctx.user.id,
    actorName: ctx.user.name,
    impersonatorId: ctx.impersonatorId,
    // Hanya nama kunci — tidak pernah nilainya (bisa berisi rahasia).
    metadata: { keys: Object.keys(body.values) }
  })
  return result
})
