import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const body = await readValidatedJson(event, z.object({ year: z.number().int().min(2000).max(2100) }))
  return importNationalHolidays(event, body.year)
})
