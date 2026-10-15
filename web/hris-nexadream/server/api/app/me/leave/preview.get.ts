import { z } from 'zod'

export default defineEventHandler((event) => {
  const query = validatedQuery(event, z.object({ leaveTypeId: z.string(), startDate: dateKeySchema, endDate: dateKeySchema, halfDay: z.coerce.boolean().optional() }))
  return previewLeaveDays(event, query)
})
