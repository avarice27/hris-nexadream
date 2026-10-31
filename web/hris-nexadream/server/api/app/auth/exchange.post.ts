import { z } from 'zod'

const schema = z.object({ code: z.string().min(20, 'Kode masuk tidak valid.').max(200) })

export default defineEventHandler(async (event) => {
  const { code } = await readValidatedJson(event, schema)
  return exchangeHandoff(event, code)
})
