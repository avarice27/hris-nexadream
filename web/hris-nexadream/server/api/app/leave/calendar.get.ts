import { z } from 'zod'

export default defineEventHandler((event) => {
  const { month } = validatedQuery(event, z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format bulan YYYY-MM.') }))
  return leaveCalendar(event, month)
})
