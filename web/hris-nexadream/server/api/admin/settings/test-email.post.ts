import { z } from 'zod'

const bodySchema = z.object({ to: z.email('Masukkan alamat email penerima yang valid.') })

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'settings.write')
  const { to } = await readValidatedJson(event, bodySchema)
  return sendTestEmail(to)
})
