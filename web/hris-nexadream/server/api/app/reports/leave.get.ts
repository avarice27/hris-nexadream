import { z } from 'zod'

export default defineEventHandler((event) => {
  const { year } = validatedQuery(event, z.object({ year: z.coerce.number().int().min(2000).max(2100) }))
  return leaveReport(event, year)
})
